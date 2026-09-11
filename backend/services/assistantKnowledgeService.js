'use strict';

/**
 * ============================================================================
 * SERVICE DE SÉLECTION DES CONNAISSANCES PUBLIQUES — ASSISTANT YZIOW
 * ============================================================================
 * Interroge exclusivement le registre de connaissances publiques validé :
 * - Source unique de vérité : backend/data/publicKnowledgeRegistry.js
 * - Sélectionne uniquement les entrées ayant le statut 'published'
 * - Filtre systématiquement toute route privée ou non autorisée
 * - Algorithme de scoring lexical déterministe sans dépendance externe
 * - Plafonne à 3 entrées et 2 500 caractères maximum
 * - RÈGLE STRICTE : Si le score minimal n'est pas atteint, AUCUN fallback arbitraire.
 *   Renvoie la réponse standardisée d'absence d'information publique vérifiée.
 */

const {
    getFullPublicKnowledge,
    isForbiddenRoute,
    PUBLIC_ALLOWLIST_ROUTES,
    loadPublishedBlogPosts
} = require('../data/publicKnowledgeRegistry');

const PUBLIC_OUT_OF_SCOPE_RESPONSE = "Je ne dispose pas d’informations publiques vérifiées permettant de répondre à cette question. Vous pouvez consulter les pages officielles de Yziow ou contacter son équipe.";

const MAX_ENTRIES = 3;
const MAX_CONTEXT_LENGTH = 2500;
const MIN_SCORE_THRESHOLD = 5;

// Mots vides courants à ignorer pour l'extraction de tokens
const STOP_WORDS = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'l',
    'et', 'ou', 'en', 'a', 'au', 'aux', 'dans', 'par', 'pour', 'sur',
    'avec', 'sans', 'sous', 'vers', 'chez', 'ce', 'cet', 'cette', 'ces',
    'mon', 'ton', 'son', 'notre', 'votre', 'leur', 'mes', 'tes', 'ses',
    'est', 'sont', 'ete', 'etre', 'avoir', 'qui', 'que', 'quoi', 'dont',
    'comment', 'pourquoi', 'quand', 'quel', 'quelle', 'quels', 'quelles',
    'preparer', 'preparation', 'bonjour', 'bonsoir', 'salut', 'merci',
    'svp', 'stp', 'aide', 'aider', 'aidez', 'question', 'questions',
    'donne', 'donner', 'parle', 'parlez', 'trouver', 'savoir',
    'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
    'ceci', 'cela', 'ca', 'ici', 'la', 'tres', 'aussi',
    'the', 'is', 'at', 'which', 'on', 'in', 'to', 'for', 'of', 'and', 'or'
]);

/**
 * Racinisation légère (stemming) pour le français afin de relier singulier/pluriel et verbe/nom
 */
function getStem(word) {
    if (!word || typeof word !== 'string' || word.length <= 3) return word || '';
    return word
        .replace(/(?:ations?|ements?|eries?|eurs?|euses?|ables?|ibilites?)$/, '')
        .replace(/(?:er|ez|ant|es?|s)$/, '');
}

/**
 * Normalise une chaîne de caractères pour la recherche lexicale
 */
function normalizeString(str) {
    if (typeof str !== 'string') return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extrait les tokens significatifs d'une requête utilisateur
 */
function extractQueryTokens(query) {
    const normalized = normalizeString(query);
    if (!normalized) return [];

    return normalized
        .split(' ')
        .filter(token => token.length >= 2 && !STOP_WORDS.has(token));
}

/**
 * Vérifie si une route fait partie des routes publiques strictement autorisées.
 * Source de vérité unique : PUBLIC_ALLOWLIST_ROUTES + articles publiés de postsData.json.
 * Rejette systématiquement toute route privée et toute route inventée (ex: /page-inventee).
 */
function isRouteAllowed(route) {
    if (!route || typeof route !== 'string') return false;
    const cleanRoute = route.trim();
    if (isForbiddenRoute(cleanRoute)) return false;

    // 1. Route statique autorisée V1 de la liste blanche centrale
    if (PUBLIC_ALLOWLIST_ROUTES.includes(cleanRoute)) {
        return true;
    }

    // 2. Route de blog : autorisée uniquement si l'article est réellement déclaré et publié dans le registre
    if (cleanRoute.startsWith('/blog/')) {
        const blogPosts = loadPublishedBlogPosts();
        return blogPosts.some(p => p.route === cleanRoute && p.publicationStatus === 'published');
    }

    // Toute autre route (inconnue ou inventée, ex: /page-inventee) est strictement refusée
    return false;
}

/**
 * Neutralise tout caractère de contrôle ou tentative d'instruction dans un texte de données
 */
function sanitizeContentData(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
        .replace(/<\/?(?:system|instruction|prompt|secret)>/gi, '')
        .trim();
}

/**
 * Calcule un score de pertinence lexical entre une requête et une entrée du registre
 */
function computeRelevanceScore(entry, tokens, rawQueryNormalized) {
    let score = 0;

    const normalizedTitle = normalizeString(entry.title || '');
    const normalizedRoute = normalizeString(entry.route || '');
    const normalizedKeywords = (entry.keywords || []).map(k => normalizeString(k));
    const normalizedSummary = normalizeString(entry.summary || '');
    const normalizedContent = normalizeString(entry.contentValidated || '');

    // 1. Bonus si le titre contient une phrase exacte de la requête
    if (rawQueryNormalized && rawQueryNormalized.length > 5 && normalizedTitle.includes(rawQueryNormalized)) {
        score += 15;
    }

    // 2. Bonus si un mot-clé correspond exactement à l'expression recherchée
    if (rawQueryNormalized && normalizedKeywords.includes(rawQueryNormalized)) {
        score += 12;
    }

    // 3. Scoring par token significatif avec racinisation
    for (const token of tokens) {
        const tokenStem = getStem(token);

        // Correspondance dans les mots-clés (très représentatifs)
        for (const kw of normalizedKeywords) {
            const kwStem = getStem(kw);
            if (kw === token) {
                score += 8;
            } else if (kw.includes(token) || (tokenStem.length >= 3 && (kw.includes(tokenStem) || kwStem === tokenStem))) {
                score += 5;
            }
        }

        // Correspondance dans le titre
        if (normalizedTitle.split(' ').includes(token)) {
            score += 6;
        } else if (normalizedTitle.includes(token) || (tokenStem.length >= 3 && normalizedTitle.includes(tokenStem))) {
            score += 4;
        }

        // Correspondance dans la route (ex: 'contact', 'about', 'guide', 'partenaires')
        if (normalizedRoute.split(' ').includes(token) || normalizedRoute.replace('/', '') === token) {
            score += 7;
        }

        // Correspondance dans le résumé
        if (normalizedSummary.includes(token) || (tokenStem.length >= 3 && normalizedSummary.includes(tokenStem))) {
            score += 3;
        }

        // Correspondance dans le contenu validé
        if (normalizedContent.includes(token) || (tokenStem.length >= 3 && normalizedContent.includes(tokenStem))) {
            score += 3;
        }
    }

    return score;
}

/**
 * Sélectionne les entrées publiques les plus pertinentes pour la question de l'utilisateur.
 *
 * @param {string|Array} queryOrMessages - La question de l'utilisateur ou le tableau de messages
 * @param {Array} [customRegistry] - Registre personnalisé (utile pour les tests d'injection/simulation)
 * @returns {{ entries: Array, hasRelevantKnowledge: boolean, totalScore: number }}
 */
function selectRelevantKnowledge(queryOrMessages, customRegistry = null) {
    let query = '';
    if (typeof queryOrMessages === 'string') {
        query = queryOrMessages;
    } else if (Array.isArray(queryOrMessages) && queryOrMessages.length > 0) {
        // Utilise la dernière question de l'utilisateur
        const userMessages = queryOrMessages.filter(m => (m.sender === 'user' || m.role === 'user'));
        const lastMsg = userMessages[userMessages.length - 1];
        query = (lastMsg?.text !== undefined ? lastMsg.text : lastMsg?.content) || '';
    }

    const tokens = extractQueryTokens(query);
    const rawQueryNormalized = normalizeString(query);

    if (tokens.length === 0 && !rawQueryNormalized) {
        return { entries: [], hasRelevantKnowledge: false, totalScore: 0 };
    }

    const fullRegistry = customRegistry || getFullPublicKnowledge();

    // Filtre de base : uniquement schéma strict publicationStatus === 'published', route autorisée, jamais privée
    const candidateEntries = fullRegistry.filter(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (entry.publicationStatus !== 'published') return false;
        if (!isRouteAllowed(entry.route)) return false;
        return true;
    });

    const scoredEntries = [];

    for (const entry of candidateEntries) {
        const score = computeRelevanceScore(entry, tokens, rawQueryNormalized);
        if (score >= MIN_SCORE_THRESHOLD) {
            scoredEntries.push({ entry, score });
        }
    }

    // Si aucune entrée n'atteint le seuil minimal : PAS DE FALLBACK ARBITRAIRE
    if (scoredEntries.length === 0) {
        return { entries: [], hasRelevantKnowledge: false, totalScore: 0 };
    }

    // Trie par score décroissant et limite au nombre maximal d'entrées
    scoredEntries.sort((a, b) => b.score - a.score);
    const selected = scoredEntries.slice(0, MAX_ENTRIES).map(item => item.entry);

    return {
        entries: selected,
        hasRelevantKnowledge: true,
        totalScore: scoredEntries[0].score
    };
}

/**
 * Formate les entrées sélectionnées en bloc de contexte structuré plafonné à 2 500 caractères.
 *
 * @param {Array} entries - Les entrées sélectionnées
 * @returns {string} - Le texte formaté avec délimiteurs constants
 */
function formatKnowledgeContext(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return '';
    }

    const blocks = [];
    let currentLength = 0;

    for (const entry of entries) {
        const title = sanitizeContentData(entry.title || '');
        const route = sanitizeContentData(entry.route || '');
        const url = sanitizeContentData(entry.canonicalUrl || '');
        const summary = sanitizeContentData(entry.summary || '');
        const content = sanitizeContentData(entry.contentValidated || '');

        const header = `<knowledge_item route="${route}" url="${url}">\nTitre: ${title}\nRésumé: ${summary}\nContenu vérifié: `;
        const footer = `\n</knowledge_item>`;
        const fullBlock = `${header}${content}${footer}`;

        // Séparateur \n\n entre blocs
        const separatorLength = blocks.length > 0 ? 2 : 0;

        if (currentLength + separatorLength + fullBlock.length <= MAX_CONTEXT_LENGTH) {
            blocks.push(fullBlock);
            currentLength += separatorLength + fullBlock.length;
        } else {
            // Calcule l'espace restant pour le contenu tronqué
            const spaceAvailableForContent = MAX_CONTEXT_LENGTH - currentLength - separatorLength - header.length - footer.length - 3;
            if (spaceAvailableForContent > 50) {
                const truncatedContent = content.slice(0, spaceAvailableForContent) + '...';
                const truncatedBlock = `${header}${truncatedContent}${footer}`;
                blocks.push(truncatedBlock);
            }
            break;
        }
    }

    const result = blocks.join('\n\n');
    return result.length > MAX_CONTEXT_LENGTH ? result.slice(0, MAX_CONTEXT_LENGTH) : result;
}

module.exports = {
    PUBLIC_OUT_OF_SCOPE_RESPONSE,
    MAX_ENTRIES,
    MAX_CONTEXT_LENGTH,
    MIN_SCORE_THRESHOLD,
    normalizeString,
    extractQueryTokens,
    isRouteAllowed,
    sanitizeContentData,
    computeRelevanceScore,
    selectRelevantKnowledge,
    formatKnowledgeContext
};
