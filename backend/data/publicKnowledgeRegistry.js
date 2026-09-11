'use strict';

/**
 * ============================================================================
 * REGISTRE CENTRAL DES CONNAISSANCES PUBLIQUES VALIDÉES — YZIOW V1
 * ============================================================================
 * Source de vérité unique pour les connaissances publiques et le sitemap.
 *
 * RÈGLES DE SÉCURITÉ STRICTES (FAIL-CLOSED) :
 * 1. Seules les routes explicitement déclarées dans PUBLIC_ALLOWLIST_ROUTES sont autorisées.
 * 2. Aucune route privée, administrative, scolaire ou liée à des données personnelles
 *    ne peut être inscrite dans ce registre.
 * 3. Les contenus sont des données factuelles pures, non exécutables et exemptes de code/script.
 * 4. Les URL canoniques doivent impérativement appartenir au domaine officiel 'https://yziow.com'.
 * 5. Toute mise à jour nécessite une modification versionnée et un redéploiement d'application.
 */

const fs = require('node:fs');
const path = require('node:path');

const CANONICAL_DOMAIN = 'https://www.yziow.com';



/**
 * Liste blanche stricte des routes publiques autorisées pour la V1.
 */
const PUBLIC_ALLOWLIST_ROUTES = Object.freeze([
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
]);

/**
 * Motifs formellement interdits dans le registre et le sitemap (Fail-closed).
 */
const FORBIDDEN_ROUTE_PATTERNS = Object.freeze([
    /^\/login(\/|$)/i,
    /^\/register(\/|$)/i,
    /^\/api(\/|$)/i,
    /^\/dashboard(\/|$)/i,
    /^\/parent/i,
    /^\/prof/i,
    /^\/superadmin/i,
    /^\/ambassadeur\/dashboard/i,
    /^\/d(\/|$)/i,
    /^\/eleves/i,
    /^\/paiements/i,
    /^\/depenses/i,
    /^\/analyses/i,
    /^\/documents/i,
    /^\/parametres/i,
    /^\/recouvrement/i,
    /^\/dons/i,
    /^\/carte_scolaire/i,
    /^\/gestion_academique/i,
    /^\/saisie_notes/i,
    /^\/saisie_presence/i,
    /^\/emploi_du_temps/i,
    /^\/bulletins/i,
    /^\/verification_recu/i,
    /^\/historique_activites/i,
    /^\/parents_list/i,
    /^\/import_export/i,
    /^\/chat(\/|$)/i,
    /^\/annonces/i,
    /^\/communication/i,
    /^\/gestion_personnel/i,
    /^\/salaires/i,
    /^\/cahier_textes/i,
    /^\/support(\/|$)/i,
    /^\/scan_/i
]);

/**
 * Valide si une route est strictement interdite.
 */
function isForbiddenRoute(route) {
    if (!route || typeof route !== 'string') return true;
    const cleanRoute = route.trim();
    return FORBIDDEN_ROUTE_PATTERNS.some(pattern => pattern.test(cleanRoute));
}

/**
 * Valide une entrée individuelle du registre selon le schéma strict.
 */
function validateKnowledgeEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('ENTRÉE_INVALIDE: L\'entrée du registre doit être un objet.');
    }

    const {
        route,
        title,
        language,
        summary,
        contentValidated,
        keywords,
        canonicalUrl,
        publicationStatus,
        updatedAt,
        version,
        sitemap
    } = entry;

    if (!route || typeof route !== 'string' || !route.startsWith('/')) {
        throw new Error(`ROUTE_INVALIDE: "${route}" doit être une chaîne débutant par "/".`);
    }

    if (isForbiddenRoute(route)) {
        throw new Error(`ROUTE_INTERDITE: La route "${route}" appartient à la liste d'exclusion stricte.`);
    }

    // Si ce n'est pas un article de blog (/blog/...), la route doit être dans PUBLIC_ALLOWLIST_ROUTES
    const isBlogSubroute = route.startsWith('/blog/') && route.length > 6;
    if (!isBlogSubroute && !PUBLIC_ALLOWLIST_ROUTES.includes(route)) {
        throw new Error(`ROUTE_NON_AUTORISÉE: La route "${route}" n'est pas dans la liste blanche V1.`);
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        throw new Error(`TITRE_REQUIS: Titre manquant pour la route "${route}".`);
    }

    const validLangs = ['fr', 'en', 'es', 'ar', 'de', 'it', 'pt', 'ru', 'zh'];
    if (!language || !validLangs.includes(language)) {
        throw new Error(`LANGUE_INVALIDE: "${language}" pour la route "${route}".`);
    }

    if (!summary || typeof summary !== 'string' || summary.trim().length < 10) {
        throw new Error(`RÉSUMÉ_REQUIS: Le résumé doit comporter au moins 10 caractères pour "${route}".`);
    }

    if (!contentValidated || typeof contentValidated !== 'string' || contentValidated.trim().length < 10) {
        throw new Error(`CONTENU_REQUIS: Le contenu validé doit comporter au moins 10 caractères pour "${route}".`);
    }

    if (!Array.isArray(keywords) || keywords.length === 0) {
        throw new Error(`MOTS_CLÉS_REQUIS: Au moins un mot-clé requis pour "${route}".`);
    }

    if (!canonicalUrl || typeof canonicalUrl !== 'string') {
        throw new Error(`URL_CANONIQUE_REQUISE: URL canonique manquante pour "${route}".`);
    }

    if (!canonicalUrl.startsWith(`${CANONICAL_DOMAIN}/`)) {
        throw new Error(`DOMAINE_CANONIQUE_INVALIDE: L'URL "${canonicalUrl}" doit débuter par le domaine officiel "${CANONICAL_DOMAIN}/".`);
    }

    const expectedCanonical = `${CANONICAL_DOMAIN}${route === '/' ? '/' : route}`;
    if (canonicalUrl !== expectedCanonical) {
        throw new Error(`URL_CANONIQUE_INVALIDE: Reçu "${canonicalUrl}", attendu "${expectedCanonical}".`);
    }

    if (publicationStatus !== 'published' && publicationStatus !== 'draft' && publicationStatus !== 'archived') {
        throw new Error(`STATUT_INVALIDE: Statut "${publicationStatus}" non reconnu pour "${route}".`);
    }

    if (!updatedAt || !/^\d{4}-\d{2}-\d{2}$/.test(updatedAt)) {
        throw new Error(`DATE_INVALIDE: "updatedAt" doit respecter le format YYYY-MM-DD pour "${route}".`);
    }

    if (!version || typeof version !== 'string') {
        throw new Error(`VERSION_REQUISE: Version manquante pour "${route}".`);
    }

    if (!sitemap || typeof sitemap !== 'object') {
        throw new Error(`SITEMAP_CONFIG_REQUISE: Configuration sitemap manquante pour "${route}".`);
    }

    if (typeof sitemap.include !== 'boolean') {
        throw new Error(`SITEMAP_INCLUDE_REQUIS: "sitemap.include" doit être un booléen pour "${route}".`);
    }

    if (sitemap.include) {
        const validFreqs = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
        if (!validFreqs.includes(sitemap.changefreq)) {
            throw new Error(`SITEMAP_CHANGEFREQ_INVALIDE: "${sitemap.changefreq}" pour "${route}".`);
        }
        if (!/^(0\.[0-9]|1\.0)$/.test(String(sitemap.priority))) {
            throw new Error(`SITEMAP_PRIORITY_INVALIDE: "${sitemap.priority}" pour "${route}" (attendu 0.0 à 1.0).`);
        }
    }

    return true;
}

/**
 * Entrées statiques officielles des 12 pages publiques validées (V1).
 */
const STATIC_PUBLIC_ENTRIES = Object.freeze([
    {
        route: '/',
        title: 'Yziow - Plateforme moderne de gestion scolaire',
        language: 'fr',
        summary: 'Plateforme cloud complète de gestion pour établissements scolaires (maternelles, primaires, collèges, lycées et supérieur) : gestion des élèves, bulletins certifiés PDF, présences par QR Code, comptabilité et portail parents.',
        contentValidated: 'Yziow est un logiciel SaaS complet de gestion scolaire. Il permet l\'administration des inscriptions, la saisie des notes, l\'édition des bulletins PDF, l\'émargement par scanner QR Code, le suivi de la comptabilité et la communication avec les familles.',
        keywords: ['gestion scolaire', 'logiciel ecole', 'bulletins pdf', 'qr code', 'presence', 'comptabilite', 'portail parents', 'essai gratuit'],
        canonicalUrl: 'https://www.yziow.com/',
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'daily',
            priority: '1.0'
        }
    },
    {
        route: '/about',
        title: 'À propos de YZIOW',
        language: 'fr',
        summary: 'Mission et vision d\'YZIOW : moderniser, fiabiliser et simplifier la gestion administrative, pédagogique et financière des établissements scolaires.',
        contentValidated: 'YZIOW a été conçu pour répondre aux défis organisationnels des écoles. La plateforme offre un environnement structuré et sécurisé pour faciliter le travail des équipes éducatives et rapprocher les familles de la vie scolaire.',
        keywords: ['a propos', 'mission', 'equipe', 'vision', 'edtech', 'valeurs'],
        canonicalUrl: 'https://www.yziow.com/about',
        publicationStatus: 'published',
        updatedAt: '2026-09-09',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'monthly',
            priority: '0.8'
        }
    },
    {
        route: '/contact',
        title: 'Contactez l\'équipe YZIOW',
        language: 'fr',
        summary: 'Formulaire de contact officiel pour toute question générale, demande de démonstration ou prise de contact institutionnelle avec l\'équipe YZIOW.',
        contentValidated: 'La page Contact permet aux visiteurs, directeurs d\'écoles et partenaires d\'adresser un message direct à l\'équipe YZIOW. Un formulaire sécurisé recueille le nom, l\'adresse email, le pays et l\'objet de la demande.',
        keywords: ['contact', 'support', 'message', 'renseignements', 'aide', 'demande'],
        canonicalUrl: 'https://www.yziow.com/contact',
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'monthly',
            priority: '0.8'
        }
    },
    {
        route: '/careers',
        title: 'Carrières & Recrutement - YZIOW',
        language: 'fr',
        summary: 'Opportunités professionnelles et candidatures chez YZIOW dans les métiers de l\'ingénierie logicielle, de l\'accompagnement client et de la pédagogie numérique.',
        contentValidated: 'YZIOW recherche régulièrement des talents engagés pour l\'éducation et les technologies. La page Carrières présente la culture de travail et permet de soumettre une candidature spontanée.',
        keywords: ['carrieres', 'recrutement', 'emploi', 'jobs', 'rejoindre', 'talents'],
        canonicalUrl: 'https://www.yziow.com/careers',
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'monthly',
            priority: '0.7'
        }
    },
    {
        route: '/guide',
        title: 'Guide d\'utilisation YZIOW',
        language: 'fr',
        summary: 'Documentation interactive et repères méthodologiques pour configurer et utiliser les fonctionnalités de gestion scolaire d\'YZIOW.',
        contentValidated: 'Le Guide d\'utilisation détaille le parcours étape par étape : création d\'année scolaire, inscription des élèves, gestion des classes, émargement QR Code, édition des bulletins et gestion des reçus de scolarité.',
        keywords: ['guide', 'tutoriel', 'manuel', 'aide', 'faq', 'documentation', 'utilisation'],
        canonicalUrl: 'https://www.yziow.com/guide',
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'monthly',
            priority: '0.8'
        }
    },
    {
        route: '/partenaires',
        title: 'Partenaires & Distributeurs YZIOW',
        language: 'fr',
        summary: 'Cadre de collaboration pour ONG, banques, institutions publiques et distributeurs locaux souhaitant accompagner l\'équipement numérique des établissements scolaires.',
        contentValidated: 'YZIOW collabore avec des partenaires institutionnels, des réseaux éducatifs et des acteurs technologiques pour déployer des solutions adaptées aux contextes locaux. Des formulaires spécifiques permettent d\'exprimer un projet de partenariat.',
        keywords: ['partenaires', 'partenariats', 'distributeurs', 'banques', 'ong', 'institutions'],
        canonicalUrl: 'https://www.yziow.com/partenaires',
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'monthly',
            priority: '0.8'
        }
    },
    {
        route: '/blog',
        title: 'Blog YZIOW - Gestion scolaire et numérique éducatif',
        language: 'fr',
        summary: 'Articles d\'analyse, retours d\'expérience et conseils pratiques sur l\'organisation, la pédagogie et l\'administration des écoles.',
        contentValidated: 'Le Blog officiel YZIOW publie des articles de fond destinés aux chefs d\'établissement, enseignants et acteurs éducatifs pour réussir la transition numérique de leur structure.',
        keywords: ['blog', 'articles', 'conseils', 'actualites', 'methodes', 'pedagogie'],
        canonicalUrl: 'https://www.yziow.com/blog',
        publicationStatus: 'published',
        updatedAt: '2026-08-27',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'weekly',
            priority: '0.8'
        }
    },
    {
        route: '/ambassadeur',
        title: 'Programme Ambassadeur YZIOW',
        language: 'fr',
        summary: 'Programme officiel d\'affiliation permettant aux partenaires et prescripteurs de présenter YZIOW aux écoles et de percevoir des commissions sur les abonnements.',
        contentValidated: 'Le portail Ambassadeur permet aux affiliés agréés de s\'inscrire, de disposer de liens et d\'accéder à leurs outils de recommandation. Le statut actif est soumis à validation.',
        keywords: ['ambassadeur', 'affiliation', 'parrainage', 'commissions', 'recommander'],
        canonicalUrl: 'https://www.yziow.com/ambassadeur',
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'monthly',
            priority: '0.8'
        }
    },
    {
        route: '/ambassadeur/kit',
        title: 'Kit de prospection Ambassadeur YZIOW',
        language: 'fr',
        summary: 'Supports d\'information commerciale, prospectus de présentation et consultation des grilles tarifaires officielles par pays pour les ambassadeurs.',
        contentValidated: 'Le Kit Ambassadeur met à disposition les prospectus officiels, les fiches de synthèse par cycle scolaire et l\'accès en lecture seule aux grilles tarifaires officielles adaptées à chaque pays.',
        keywords: ['kit ambassadeur', 'prospectus', 'tarifs', 'documentation', 'brochure', 'fiches'],
        canonicalUrl: 'https://www.yziow.com/ambassadeur/kit',
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'monthly',
            priority: '0.7'
        }
    },
    {
        route: '/cgu',
        title: 'Conditions Générales d\'Utilisation - YZIOW',
        language: 'fr',
        summary: 'Conditions contractuelles régissant l\'accès, la souscription et l\'utilisation des services de la plateforme SaaS YZIOW par les établissements abonnés.',
        contentValidated: 'Les CGU précisent les droits et devoirs des utilisateurs, les conditions d\'abonnement annuel, les modalités de résiliation et les limites de responsabilité de l\'éditeur de la plateforme.',
        keywords: ['cgu', 'conditions generales', 'termes', 'utilisation', 'contrat', 'responsabilite'],
        canonicalUrl: 'https://www.yziow.com/cgu',
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'yearly',
            priority: '0.5'
        }
    },
    {
        route: '/privacy',
        title: 'Politique de Confidentialité - YZIOW',
        language: 'fr',
        summary: 'Engagements et règles de traitement des données à caractère personnel collectées dans le cadre de l\'utilisation de la plateforme YZIOW.',
        contentValidated: 'La politique de confidentialité détaille les mesures techniques de cloisonnement des données (multi-tenant), les finalités du traitement, la durée de conservation et l\'exercice des droits des utilisateurs.',
        keywords: ['confidentialite', 'donnees personnelles', 'securite', 'vie privee', 'protection'],
        canonicalUrl: 'https://www.yziow.com/privacy',
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'yearly',
            priority: '0.5'
        }
    },
    {
        route: '/legal',
        title: 'Mentions Légales - YZIOW',
        language: 'fr',
        summary: 'Identité de l\'éditeur, coordonnées de contact, hébergement de la plateforme et dispositions relatives à la propriété intellectuelle d\'YZIOW.',
        contentValidated: 'Les mentions légales fournissent l\'identification juridique de la société éditrice, les références de l\'hébergeur des serveurs, ainsi que les règles de propriété intellectuelle protégeant la marque et les logiciels.',
        keywords: ['mentions legales', 'editeur', 'hebergement', 'propriete intellectuelle', 'societe'],
        canonicalUrl: 'https://www.yziow.com/legal',
        publicationStatus: 'published',
        updatedAt: '2026-08-01',
        version: '1.0',
        sitemap: {
            include: true,
            changefreq: 'yearly',
            priority: '0.5'
        }
    }
]);

/**
 * Valide l'ensemble du registre et garantit l'unicité stricte des routes et URL canoniques.
 */
function buildValidatedRegistry(additionalEntries = []) {
    const combined = [...STATIC_PUBLIC_ENTRIES, ...additionalEntries];
    const seenRoutes = new Set();
    const seenUrls = new Set();

    for (const entry of combined) {
        validateKnowledgeEntry(entry);

        if (seenRoutes.has(entry.route)) {
            throw new Error(`DOUBLON_ROUTE: La route "${entry.route}" est déclarée plusieurs fois.`);
        }
        seenRoutes.add(entry.route);

        if (seenUrls.has(entry.canonicalUrl)) {
            throw new Error(`DOUBLON_URL: L'URL canonique "${entry.canonicalUrl}" est déclarée plusieurs fois.`);
        }
        seenUrls.add(entry.canonicalUrl);
    }

    return combined;
}

/**
 * Charge les articles de blog publiés depuis la source unique postsData.json.
 * Exclut automatiquement les brouillons, les routes privées et les données non conformes.
 */
function loadPublishedBlogPosts() {
    const postsJsonPath = path.resolve(__dirname, '../../src/content/blog/postsData.json');
    if (!fs.existsSync(postsJsonPath)) return [];

    try {
        const raw = fs.readFileSync(postsJsonPath, 'utf8');
        const posts = JSON.parse(raw);
        if (!Array.isArray(posts)) return [];

        const published = posts.filter(p => p && p.status === 'published' && p.slug);
        return published.map(p => {
            const route = `/blog/${p.slug.trim()}`;
            return {
                route,
                title: p.title || '',
                language: p.language || 'fr',
                summary: p.excerpt || p.title || '',
                contentValidated: p.content || '',
                keywords: Array.isArray(p.tags) && p.tags.length > 0 ? p.tags : ['blog', 'yziow'],
                canonicalUrl: `${CANONICAL_DOMAIN}${route}`,
                publicationStatus: 'published',
                updatedAt: p.publishedAt || '2026-08-27',
                version: '1.0',
                sitemap: {
                    include: true,
                    changefreq: 'monthly',
                    priority: '0.7'
                }
            };
        });
    } catch {
        return [];
    }
}

/**
 * Retourne le registre complet validé intégrant les pages statiques et les articles publiés.
 * Source de vérité prête pour la consommation future du chatbot sans crawler ni duplication.
 */
function getFullPublicKnowledge() {
    const blogEntries = loadPublishedBlogPosts();
    return buildValidatedRegistry(blogEntries);
}

module.exports = {
    CANONICAL_DOMAIN,
    PUBLIC_ALLOWLIST_ROUTES,
    FORBIDDEN_ROUTE_PATTERNS,
    isForbiddenRoute,
    validateKnowledgeEntry,
    STATIC_PUBLIC_ENTRIES,
    buildValidatedRegistry,
    loadPublishedBlogPosts,
    getFullPublicKnowledge
};
