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
 * 4. Les URL canoniques doivent impérativement appartenir au domaine officiel 'https://www.yziow.com'.
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

    if (!language || language !== 'fr') {
        throw new Error(`LANGUE_INVALIDE: Seul le français ("fr") est autorisé en V1 (reçu: "${language}").`);
    }

    if (!summary || typeof summary !== 'string' || summary.trim().length === 0) {
        throw new Error(`RÉSUMÉ_REQUIS: Résumé manquant pour la route "${route}".`);
    }

    if (!contentValidated || typeof contentValidated !== 'string' || contentValidated.trim().length === 0) {
        throw new Error(`CONTENU_REQUIS: Contenu validé manquant pour la route "${route}".`);
    }

    if (!Array.isArray(keywords) || keywords.length === 0) {
        throw new Error(`MOTS_CLÉS_REQUIS: Au moins un mot-clé requis pour la route "${route}".`);
    }

    // Contrôle strict de l'URL canonique (fail-closed)
    const expectedCanonicalUrl = `${CANONICAL_DOMAIN}${route === '/' ? '/' : route}`;
    if (canonicalUrl !== expectedCanonicalUrl) {
        throw new Error(`URL_CANONIQUE_INVALIDE: "${canonicalUrl}" ne correspond pas à l'URL attendue "${expectedCanonicalUrl}".`);
    }

    if (publicationStatus !== 'published') {
        throw new Error(`STATUT_PUBLICATION_INVALIDE: Seul le statut "published" est autorisé en V1 (reçu: "${publicationStatus}").`);
    }

    // Format de date ISO YYYY-MM-DD
    if (!updatedAt || !/^\d{4}-\d{2}-\d{2}$/.test(updatedAt)) {
        throw new Error(`DATE_MISE_A_JOUR_INVALIDE: Format YYYY-MM-DD requis pour "${updatedAt}".`);
    }

    if (!version || typeof version !== 'string') {
        throw new Error(`VERSION_REQUISE: Version requise pour la route "${route}".`);
    }

    // Validation des métadonnées du sitemap
    if (sitemap) {
        if (typeof sitemap.include !== 'boolean') {
            throw new Error(`SITEMAP_INCLUDE_INVALIDE: Booléen requis pour "${route}".`);
        }
        if (sitemap.include) {
            const validFreqs = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
            if (!validFreqs.includes(sitemap.changefreq)) {
                throw new Error(`SITEMAP_CHANGEFREQ_INVALIDE: "${sitemap.changefreq}" non autorisé.`);
            }
            const priorityNum = parseFloat(sitemap.priority);
            if (isNaN(priorityNum) || priorityNum < 0.0 || priorityNum > 1.0) {
                throw new Error(`SITEMAP_PRIORITY_INVALIDE: La priorité doit être entre 0.0 et 1.0 (reçu: "${sitemap.priority}").`);
            }
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
        summary: 'Plateforme cloud complète de gestion pour établissements scolaires (maternelles, primaires, collèges, lycées et supérieur) : gestion des élèves, bulletins certifiés PDF, présences par QR Code, comptabilité, portail parents et 14 jours d\'essai gratuit sans carte bancaire.',
        contentValidated: 'Yziow est un logiciel SaaS complet de gestion scolaire pour écoles maternelles, primaires, collèges, lycées et universités. Il permet l\'administration des inscriptions, la saisie des notes, l\'édition des bulletins certifiés PDF, l\'émargement par scanner QR Code, le suivi de la comptabilité, les paiements et la communication avec les familles. L\'inscription d\'un établissement donne accès à 14 jours d\'essai gratuit sans carte bancaire.',
        keywords: ['gestion scolaire', 'logiciel ecole', 'bulletins pdf', 'qr code', 'presence', 'comptabilite', 'portail parents', 'essai gratuit', '14 jours', 'inscription', 'inscrire'],
        canonicalUrl: 'https://www.yziow.com/',
        publicationStatus: 'published',
        updatedAt: '2026-09-11',
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
        summary: 'Documentation interactive, repères méthodologiques et procédures pour configurer et utiliser YZIOW : inscription d\'établissement via “Commencer gratuitement” sous le profil Directeur, gestion des classes, élèves, présences, bulletins et comptabilité.',
        contentValidated: 'Le Guide d\'utilisation détaille les procédures officielles de la plateforme YZIOW : 1. Inscription d\'un établissement : Rendez-vous sur https://www.yziow.com, cliquez sur “Commencer gratuitement”, puis renseignez les informations de l’établissement et celles du Directeur ou de la Directrice. Le compte responsable sera créé sous le profil Directeur. Un fondateur qui exerce la direction utilise ce même profil. Si la direction est confiée à une autre personne, c’est la direction désignée qui effectue l’inscription. Aucun rôle d\'authentification spécifique de fondateur n\'existe sur la plateforme. 2. Configuration : création de l\'année scolaire et organisation des classes. 3. Élèves et personnel : gestion des inscriptions et attributions. 4. Présences : émargement par scanner QR Code. 5. Notes et bulletins : saisie des évaluations et génération des bulletins scolaires certifiés au format PDF. 6. Comptabilité : enregistrement des paiements et édition instantanée des reçus. 7. Espace parents : suivi en temps réel de la scolarité.',
        keywords: ['guide', 'tutoriel', 'manuel', 'aide', 'faq', 'documentation', 'utilisation', 'inscription', 'inscrire', 'directeur', 'fondateur', 'bulletins', 'notes', 'presence', 'qr code', 'comptabilite'],
        canonicalUrl: 'https://www.yziow.com/guide',
        publicationStatus: 'published',
        updatedAt: '2026-09-11',
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
