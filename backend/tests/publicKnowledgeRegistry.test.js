// backend/tests/publicKnowledgeRegistry.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { installSupabaseMock, restoreSupabaseMock } = require('./helpers/mockSupabaseModule');
installSupabaseMock();

const { Module } = require('node:module');

// Mock auth middleware pour éviter l'exigence de JWT_SECRET en test unitaire isolé
const authPath = require.resolve('../middleware/auth');
const origAuthCache = require.cache[authPath];
const mockAuthModule = new Module(authPath);
mockAuthModule.id = authPath;
mockAuthModule.filename = authPath;
mockAuthModule.loaded = true;
mockAuthModule.exports = {
    authenticateToken: (req, res, next) => next(),
    requireSuperAdmin: (req, res, next) => next(),
    requireSchool: (req, res, next) => next()
};
require.cache[authPath] = mockAuthModule;

test.after(() => {
    restoreSupabaseMock();
    if (origAuthCache) {
        require.cache[authPath] = origAuthCache;
    } else {
        delete require.cache[authPath];
    }
});

const {
    CANONICAL_DOMAIN,
    PUBLIC_ALLOWLIST_ROUTES,
    FORBIDDEN_ROUTE_PATTERNS,
    isForbiddenRoute,
    validateKnowledgeEntry,
    STATIC_PUBLIC_ENTRIES,
    buildValidatedRegistry
} = require('../data/publicKnowledgeRegistry');

const workspaceRoot = path.resolve(__dirname, '../..');

// ============================================================================
// 1. Validation du schéma strict du registre
// ============================================================================
test('1. Validation du schéma strict pour chaque entrée du registre statique', () => {
    assert.ok(Array.isArray(STATIC_PUBLIC_ENTRIES), 'STATIC_PUBLIC_ENTRIES doit être un tableau');
    assert.strictEqual(STATIC_PUBLIC_ENTRIES.length, 12, 'Il doit y avoir exactement 12 pages publiques statiques V1');

    for (const entry of STATIC_PUBLIC_ENTRIES) {
        assert.doesNotThrow(() => validateKnowledgeEntry(entry), `L'entrée "${entry.route}" doit respecter le schéma strict`);
        assert.ok(entry.title && typeof entry.title === 'string', `Titre manquant pour ${entry.route}`);
        assert.ok(entry.summary && entry.summary.length >= 10, `Résumé trop court pour ${entry.route}`);
        assert.ok(entry.contentValidated && entry.contentValidated.length >= 10, `Contenu validé trop court pour ${entry.route}`);
        assert.ok(Array.isArray(entry.keywords) && entry.keywords.length > 0, `Mots-clés manquants pour ${entry.route}`);
        assert.ok(entry.sitemap && typeof entry.sitemap.include === 'boolean', `Config sitemap manquante pour ${entry.route}`);
    }
});

// ============================================================================
// 2. Unicité stricte des routes et URL canoniques
// ============================================================================
test('2. Unicité stricte des routes et des URL canoniques dans le registre', () => {
    const registry = buildValidatedRegistry();
    const routes = registry.map(e => e.route);
    const urls = registry.map(e => e.canonicalUrl);

    const uniqueRoutes = new Set(routes);
    const uniqueUrls = new Set(urls);

    assert.strictEqual(routes.length, uniqueRoutes.size, 'Toutes les routes du registre doivent être strictement uniques');
    assert.strictEqual(urls.length, uniqueUrls.size, 'Toutes les URL canoniques doivent être strictement uniques');
});

// ============================================================================
// 3. Rejet d'une route privée placée accidentellement dans le registre
// ============================================================================
test('3. Rejet immédiat (fail-closed) si une route privée est injectée dans le registre', () => {
    const privateRoutes = [
        '/dashboard',
        '/parent_dashboard',
        '/parent/notes',
        '/prof_dashboard',
        '/superadmin_dashboard',
        '/superadmin/schools',
        '/ambassadeur/dashboard',
        '/eleves',
        '/paiements',
        '/salaires',
        '/bulletins'
    ];

    for (const route of privateRoutes) {
        assert.strictEqual(isForbiddenRoute(route), true, `isForbiddenRoute doit détecter ${route}`);
        const fakeEntry = {
            route,
            title: 'Tentative privée',
            language: 'fr',
            summary: 'Description non autorisée',
            contentValidated: 'Données privées protégées',
            keywords: ['test'],
            canonicalUrl: `${CANONICAL_DOMAIN}${route}`,
            publicationStatus: 'published',
            updatedAt: '2026-08-01',
            version: '1.0',
            sitemap: { include: true, changefreq: 'monthly', priority: '0.5' }
        };
        assert.throws(
            () => validateKnowledgeEntry(fakeEntry),
            /ROUTE_INTERDITE/,
            `validateKnowledgeEntry doit rejeter la route privée "${route}"`
        );
    }
});

// ============================================================================
// 4. Rejet strict de /login
// ============================================================================
test('4. Rejet strict de /login dans le registre et le sitemap', () => {
    assert.strictEqual(isForbiddenRoute('/login'), true);
    assert.strictEqual(isForbiddenRoute('/login/reset'), true);

    const loginEntry = {
        route: '/login',
        title: 'Connexion',
        language: 'fr',
        summary: 'Page de connexion',
        contentValidated: 'Authentification',
        keywords: ['login'],
        canonicalUrl: `${CANONICAL_DOMAIN}/login`,
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: { include: true, changefreq: 'monthly', priority: '0.5' }
    };
    assert.throws(() => validateKnowledgeEntry(loginEntry), /ROUTE_INTERDITE/);
});

// ============================================================================
// 5. Rejet strict de /register pour la V1
// ============================================================================
test('5. Rejet strict de /register dans le registre et le sitemap pour la V1', () => {
    assert.strictEqual(isForbiddenRoute('/register'), true);
    assert.strictEqual(isForbiddenRoute('/register/school'), true);

    const registerEntry = {
        route: '/register',
        title: 'Inscription École',
        language: 'fr',
        summary: 'Formulaire d\'inscription',
        contentValidated: 'Création de compte',
        keywords: ['register'],
        canonicalUrl: `${CANONICAL_DOMAIN}/register`,
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: { include: true, changefreq: 'monthly', priority: '0.5' }
    };
    assert.throws(() => validateKnowledgeEntry(registerEntry), /ROUTE_INTERDITE/);
});

// ============================================================================
// 6. Rejet strict de /api/*
// ============================================================================
test('6. Rejet strict des routes /api/* dans le registre', () => {
    const apiRoutes = ['/api', '/api/assistant/chat', '/api/public/contact', '/api/auth/login'];
    for (const route of apiRoutes) {
        assert.strictEqual(isForbiddenRoute(route), true);
        const apiEntry = {
            route,
            title: 'API endpoint',
            language: 'fr',
            summary: 'Route API',
            contentValidated: 'Backend service',
            keywords: ['api'],
            canonicalUrl: `${CANONICAL_DOMAIN}${route}`,
            publicationStatus: 'published',
            updatedAt: '2026-08-01',
            version: '1.0',
            sitemap: { include: true, changefreq: 'monthly', priority: '0.5' }
        };
        assert.throws(() => validateKnowledgeEntry(apiEntry), /ROUTE_INTERDITE/);
    }
});

// ============================================================================
// 7. Rejet strict de /d/* (Campagnes individuelles de dons)
// ============================================================================
test('7. Rejet strict des routes de dons individuels /d/* dans le registre', () => {
    const donationRoutes = ['/d/ecole-saint-joseph/campagne-123', '/d/school/456', '/d/'];
    for (const route of donationRoutes) {
        assert.strictEqual(isForbiddenRoute(route), true);
        const donEntry = {
            route,
            title: 'Campagne de dons',
            language: 'fr',
            summary: 'Don participatif',
            contentValidated: 'Détails de campagne',
            keywords: ['don'],
            canonicalUrl: `${CANONICAL_DOMAIN}${route}`,
            publicationStatus: 'published',
            updatedAt: '2026-08-01',
            version: '1.0',
            sitemap: { include: true, changefreq: 'monthly', priority: '0.5' }
        };
        assert.throws(() => validateKnowledgeEntry(donEntry), /ROUTE_INTERDITE/);
    }
});

// ============================================================================
// 8. Inclusion de toutes les 12 pages publiques validées
// ============================================================================
test('8. Présence exhaustive des 12 pages publiques validées V1', () => {
    const expectedPages = [
        '/',
        '/about',
        '/contact',
        '/careers',
        '/guide',
        '/partenaires',
        '/blog',
        '/ambassadeur',
        '/ambassadeur/kit',
        '/cgu',
        '/privacy',
        '/legal'
    ];

    const actualRoutes = STATIC_PUBLIC_ENTRIES.map(e => e.route);
    for (const expected of expectedPages) {
        assert.ok(actualRoutes.includes(expected), `La page publique "${expected}" doit être présente dans le registre`);
    }
    assert.strictEqual(actualRoutes.length, expectedPages.length);
});

// ============================================================================
// 9. Cohérence entre articles de blog publiés et registre / sitemap
// ============================================================================
test('9. Cohérence entre les articles publiés dans postsData.json, le registre et le sitemap généré', () => {
    const sitemapPath = path.resolve(workspaceRoot, 'public/sitemap.xml');
    assert.ok(fs.existsSync(sitemapPath), 'public/sitemap.xml doit exister');
    const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');

    // Vérifier l'article publié réel avec le domaine canonique officiel www
    const expectedPublishedSlug = 'comment-preparer-la-gestion-numerique-de-son-etablissement';
    assert.ok(
        sitemapContent.includes(`https://www.yziow.com/blog/${expectedPublishedSlug}`),
        `L'article publié "${expectedPublishedSlug}" doit être dans le sitemap avec www`
    );

    // Vérifier l'intégration dans getFullPublicKnowledge()
    const { getFullPublicKnowledge, loadPublishedBlogPosts } = require('../data/publicKnowledgeRegistry.js');
    const fullRegistry = getFullPublicKnowledge();
    const blogEntry = fullRegistry.find(e => e.route === `/blog/${expectedPublishedSlug}`);
    assert.ok(blogEntry, `L'article publié doit être présent dans le registre complet getFullPublicKnowledge()`);
    assert.strictEqual(blogEntry.publicationStatus, 'published');
    assert.strictEqual(blogEntry.canonicalUrl, `https://www.yziow.com/blog/${expectedPublishedSlug}`);
});

// ============================================================================
// 10. Absence d'articles non publiés (drafts) dans le sitemap et le registre
// ============================================================================
test('10. Absence d\'articles en brouillon (draft) dans le sitemap et le registre', () => {
    const sitemapPath = path.resolve(workspaceRoot, 'public/sitemap.xml');
    const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');

    // Vérifie qu'aucun slug de brouillon simulé ne figure dans le sitemap
    assert.strictEqual(sitemapContent.includes('/blog/article-secret-draft'), false);
    assert.strictEqual(sitemapContent.includes('/blog/brouillon-test'), false);

    // Vérifier le filtrage strict dans le registre
    const { getFullPublicKnowledge } = require('../data/publicKnowledgeRegistry.js');
    const fullRegistry = getFullPublicKnowledge();
    assert.strictEqual(fullRegistry.some(e => e.publicationStatus === 'draft'), false);
});

// ============================================================================
// 11. Validité XML du sitemap
// ============================================================================
test('11. Structure XML valide, balises fermantes et schéma sitemap standard', () => {
    const sitemapPath = path.resolve(workspaceRoot, 'public/sitemap.xml');
    const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');

    assert.ok(sitemapContent.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Doit démarrer par l\'en-tête XML');
    assert.ok(sitemapContent.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'Doit déclarer l\'espace de nom sitemap 0.9');
    assert.ok(sitemapContent.trim().endsWith('</urlset>'), 'Doit se terminer par </urlset>');

    // Vérifie la parité des balises
    const openLocs = (sitemapContent.match(/<loc>/g) || []).length;
    const closeLocs = (sitemapContent.match(/<\/loc>/g) || []).length;
    const openUrls = (sitemapContent.match(/<url>/g) || []).length;
    const closeUrls = (sitemapContent.match(/<\/url>/g) || []).length;

    // Calcul automatique du total attendu : pages statiques publiées avec sitemap.include + articles de blog publiés
    const blogPostsPath = path.resolve(workspaceRoot, 'src/content/blog/postsData.json');
    const blogPosts = JSON.parse(fs.readFileSync(blogPostsPath, 'utf8'));
    const publishedBlogArticles = blogPosts.filter(p => p && p.status === 'published');
    const publishedStaticEntries = STATIC_PUBLIC_ENTRIES.filter(e => e.publicationStatus === 'published' && e.sitemap && e.sitemap.include);
    const expectedTotalSitemapUrls = publishedStaticEntries.length + publishedBlogArticles.length;

    assert.strictEqual(openLocs, closeLocs, 'Nombre de <loc> et </loc> identique');
    assert.strictEqual(openUrls, closeUrls, 'Nombre de <url> et </url> identique');
    assert.strictEqual(openUrls, expectedTotalSitemapUrls, `Nombre d'URL conforme au registre (${publishedStaticEntries.length} pages) et blog (${publishedBlogArticles.length} articles) = ${expectedTotalSitemapUrls}`);
});

// ============================================================================
// 12. Utilisation exclusive du domaine canonique officiel https://www.yziow.com
// ============================================================================
test('12. Exclusive utilisation du domaine canonique officiel https://www.yziow.com (rejet apex sans www, localhost et domaines externes)', () => {
    // 1. Vérification de la constante canonique du registre
    assert.strictEqual(CANONICAL_DOMAIN, 'https://www.yziow.com', 'CANONICAL_DOMAIN doit valoir exactement https://www.yziow.com');

    // 2. Toutes les URL statiques du registre doivent utiliser https://www.yziow.com/
    for (const entry of STATIC_PUBLIC_ENTRIES) {
        assert.ok(
            entry.canonicalUrl.startsWith('https://www.yziow.com/'),
            `L'entrée "${entry.route}" doit avoir une canonicalUrl débutant par https://www.yziow.com/ (reçu "${entry.canonicalUrl}")`
        );
        assert.strictEqual(entry.canonicalUrl.startsWith('https://yziow.com/'), false, `L'URL ne doit pas être sur l'apex sans www`);
    }

    // 3. Toutes les URL du sitemap doivent utiliser https://www.yziow.com/
    const sitemapPath = path.resolve(workspaceRoot, 'public/sitemap.xml');
    const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');
    const locMatches = [...sitemapContent.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);

    const blogPostsPath = path.resolve(workspaceRoot, 'src/content/blog/postsData.json');
    const blogPosts = JSON.parse(fs.readFileSync(blogPostsPath, 'utf8'));
    const publishedBlogArticles = blogPosts.filter(p => p && p.status === 'published');
    const publishedStaticEntries = STATIC_PUBLIC_ENTRIES.filter(e => e.publicationStatus === 'published' && e.sitemap && e.sitemap.include);
    const expectedTotalSitemapUrls = publishedStaticEntries.length + publishedBlogArticles.length;

    // Nombre de balises <loc> correspond au total calculé
    assert.strictEqual(locMatches.length, expectedTotalSitemapUrls, `Nombre de balises <loc> conforme au total calculé (${expectedTotalSitemapUrls})`);

    // Toutes les URL attendues sont présentes
    const expectedUrls = [
        ...publishedStaticEntries.map(e => e.canonicalUrl),
        ...publishedBlogArticles.map(p => `${CANONICAL_DOMAIN}/blog/${p.slug}`)
    ];
    for (const expectedUrl of expectedUrls) {
        assert.ok(locMatches.includes(expectedUrl), `L'URL attendue "${expectedUrl}" doit figurer dans le sitemap`);
    }

    // Aucune URL supplémentaire n'est présente
    for (const actualUrl of locMatches) {
        assert.ok(expectedUrls.includes(actualUrl), `L'URL "${actualUrl}" ne correspond à aucune entrée attendue`);
    }

    // Toutes les URL sont uniques
    const uniqueLocs = new Set(locMatches);
    assert.strictEqual(uniqueLocs.size, locMatches.length, 'Toutes les balises <loc> doivent être uniques sans doublon');

    // Toutes utilisent https://www.yziow.com/
    for (const url of locMatches) {
        assert.ok(url.startsWith('https://www.yziow.com/'), `L'URL "${url}" doit impérativement débuter par https://www.yziow.com/`);
        assert.strictEqual(url.startsWith('https://yziow.com/'), false, `L'URL ne doit pas être sur l'apex sans www`);
        assert.strictEqual(url.includes('localhost'), false);
        assert.strictEqual(url.includes('127.0.0.1'), false);
    }

    // 4. Rejet strict (fail-closed) d'une URL canonique sans www par validateKnowledgeEntry
    const nonWwwEntry = {
        route: '/about',
        title: 'À propos',
        language: 'fr',
        summary: 'Résumé valide pour le test',
        contentValidated: 'Contenu validé pour le test unitaire',
        keywords: ['test'],
        canonicalUrl: 'https://yziow.com/about', // SANS www
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: { include: true, changefreq: 'monthly', priority: '0.8' }
    };
    assert.throws(
        () => validateKnowledgeEntry(nonWwwEntry),
        /DOMAINE_CANONIQUE_INVALIDE|URL_CANONIQUE_INVALIDE/,
        'Une URL utilisant https://yziow.com sans www doit être rejetée'
    );

    // 5. Rejet strict des domaines ressemblants, sous-domaines trompeurs ou domaines externes
    const deceptiveEntries = [
        'https://evil.yziow.com/about',
        'https://www.yziow.com.evil.com/about',
        'https://yziow.org/about',
        'https://example.com/about',
        'http://www.yziow.com/about' // non-HTTPS
    ];
    for (const badUrl of deceptiveEntries) {
        const badEntry = { ...nonWwwEntry, canonicalUrl: badUrl };
        assert.throws(
            () => validateKnowledgeEntry(badEntry),
            /DOMAINE_CANONIQUE_INVALIDE|URL_CANONIQUE_INVALIDE/,
            `L'URL trompeuse ou externe "${badUrl}" doit être rejetée`
        );
    }

    // 6. Absence de balise canonique statique unique dans index.html (pour éviter que toutes les routes SPA pointent vers l'accueil)
    const indexHtmlPath = path.resolve(workspaceRoot, 'index.html');
    const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');
    assert.strictEqual(
        /<link\s+[^>]*rel=["']canonical["'][^>]*>/i.test(indexHtmlContent),
        false,
        'index.html ne doit pas contenir de balise <link rel="canonical"> statique globale'
    );
});

// ============================================================================
// 13. Génération déterministe et exécution de prebuild
// ============================================================================
test('13. Déterminisme strict et régénération correcte via scripts/generateSitemap.js et prebuild', () => {
    const sitemapPath = path.resolve(workspaceRoot, 'public/sitemap.xml');
    const initialContent = fs.readFileSync(sitemapPath, 'utf-8');

    // Vérifier avec la commande verify:sitemap standard (sans flag expérimental)
    const { execSync } = require('node:child_process');
    const verifyOutput = execSync('node scripts/generateSitemap.js --verify', {
        cwd: workspaceRoot,
        encoding: 'utf-8'
    });

    assert.ok(verifyOutput.includes('VALIDATION: public/sitemap.xml est parfaitement synchronisé'));
    const secondContent = fs.readFileSync(sitemapPath, 'utf-8');
    assert.strictEqual(initialContent, secondContent, 'Le contenu du sitemap doit être strictement identique');

    // Vérifier que npm run prebuild s'exécute sans erreur
    const prebuildOutput = execSync('npm run prebuild', {
        cwd: workspaceRoot,
        encoding: 'utf-8'
    });
    assert.ok(prebuildOutput.includes('sitemap.xml généré avec succès'));
});

// ============================================================================
// 14. Absence de données personnelles ou scolaires dans le registre
// ============================================================================
test('14. Absence totale de données personnelles, scolaires ou de secrets dans le registre', () => {
    for (const entry of STATIC_PUBLIC_ENTRIES) {
        const text = `${entry.title} ${entry.summary} ${entry.contentValidated} ${entry.keywords.join(' ')}`.toLowerCase();
        const forbiddenTerms = [
            'password', 'mot de passe', 'secret', 'token', 'jwt', 'api_key',
            'eleve', 'étudiant', 'parent', 'professeur', 'salaire', 'note', 'bulletin',
            'matricule', 'recu_fiscal'
        ];

        // S'assurer qu'aucun identifiant nominatif ou clé sensible n'est présent
        assert.strictEqual(text.includes('bearer '), false);
        assert.strictEqual(text.includes('supabase_key'), false);
        assert.strictEqual(text.includes('groq_api_key'), false);
    }
});

// ============================================================================
// 15. Verrouillage strict et préservation exacte des quotas existants
// ============================================================================
test('15. Verrouillage strict des quotas : 5/h, 10/j par IP en public, 60/15min rate limit et Retry-After', () => {
    // A. Vérification de backend/routes/assistant.js (Rate Limiter 60 req / 15 min)
    const assistantRouter = require('../routes/assistant');
    const chatRoute = assistantRouter.stack.find(
        layer => layer.route && layer.route.path === '/chat' && layer.route.methods.post
    );
    assert.ok(chatRoute, 'POST /chat doit exister dans assistantRouter');
    assert.ok(chatRoute.route.stack.length >= 2, 'Doit comporter au moins le middleware rate limiter et le contrôleur');

    // B. Vérification textuelle sans modification du fichier backend/controllers/assistantController.js
    const controllerCode = fs.readFileSync(path.resolve(workspaceRoot, 'backend/controllers/assistantController.js'), 'utf-8');

    // Vérifier l'appel exact à enforceQuota avec 5/h et 10/j pour public_ip
    assert.ok(controllerCode.includes("scope: 'public_ip'"), "Le scope public_ip doit être présent");
    assert.ok(controllerCode.includes("hourLimit: 5"), "La limite horaire publique doit être strictement de 5");
    assert.ok(controllerCode.includes("dayLimit: 10"), "La limite journalière publique doit être strictement de 10");

    // Vérifier les quotas privés (30/j et 60/j)
    assert.ok(controllerCode.includes("scope: 'authenticated_user'"), "Le scope authenticated_user doit être présent");
    assert.ok(controllerCode.includes("dayLimit: 30"), "La limite utilisateur authentifié doit être strictement de 30");
    assert.ok(controllerCode.includes("scope: 'pedagogical_user'"), "Le scope pedagogical_user doit être présent");
    assert.ok(controllerCode.includes("dayLimit: 60"), "La limite pédagogique doit être strictement de 60");

    // Vérifier le traitement des réponses 429 et du Retry-After
    assert.ok(controllerCode.includes("res.set('Retry-After', String(quotaResult.retryAfter));"), "Retry-After doit être positionné");
    assert.ok(controllerCode.includes("return res.status(quotaResult.status).json({"), "Le code de statut de quota (429/503) doit être renvoyé");

    // C. Vérification de backend/routes/assistant.js pour la limite 60 req / 15 min
    const routesCode = fs.readFileSync(path.resolve(workspaceRoot, 'backend/routes/assistant.js'), 'utf-8');
    assert.ok(routesCode.includes("windowMs: 15 * 60 * 1000"), "La fenêtre de rate limit doit être de 15 minutes");
    assert.ok(routesCode.includes("max: 60"), "La limite réseau doit être strictement de 60 requêtes");
});
