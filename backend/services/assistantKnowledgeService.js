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

// Tokens métier courts autorisés malgré length < 3
const DOMAIN_SHORT_TOKENS = new Set(['qr', 'ai', 'ia']);

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
    'puis', 'pouvoir', 'peux', 'peut', 'faire', 'fais', 'fait', 'veux', 'vouloir',
    'the', 'is', 'at', 'which', 'on', 'in', 'to', 'for', 'of', 'and', 'or'
]);

/**
 * Racinisation légère (stemming) pour le français afin de relier singulier/pluriel et verbe/nom
 */
function getStem(word) {
    if (!word || typeof word !== 'string' || word.length < 4) return word || '';
    const stemmed = word
        .replace(/(?:ations?|itions?|options?|ptions?|ions?|ements?|eries?|eurs?|euses?|ables?|ibilites?)$/, '')
        .replace(/(?:er|ez|ant|ir|re|es?|s)$/, '');
    return stemmed.length >= 3 ? stemmed : word;
}

/**
 * Normalise une chaîne de caractères pour la recherche lexicale
 */
function normalizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s/_-]/g, ' ')
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
        .split(/[\s/_\-]+/)
        .map(t => t.trim())
        .filter(token => (token.length >= 3 || DOMAIN_SHORT_TOKENS.has(token)) && !STOP_WORDS.has(token));
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
 * Calcule un score de pertinence lexical entre une requête et une entrée du registre.
 * Évite l'amplification par répétition de mots-clés synonymes et garantit
 * des radicaux d'au moins 3 caractères non vides.
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

    // 2. Bonus si un mot-clé correspond exactement à l'expression recherchée ou expression multi-mots
    if (rawQueryNormalized) {
        for (const kw of normalizedKeywords) {
            if (kw === rawQueryNormalized) {
                score += 12;
                break;
            } else if (kw.includes(' ') && rawQueryNormalized.includes(kw)) {
                score += 10;
                break;
            }
        }
    }

    let matchedTokenCount = 0;

    // 3. Scoring par token significatif avec racinisation
    for (const token of tokens) {
        const tokenStem = getStem(token);
        let tokenMatchedInEntry = false;

        // Correspondance dans les mots-clés : AU MAXIMUM une fois par token pour éviter l'amplification par synonymes
        let bestKwScoreForToken = 0;
        for (const kw of normalizedKeywords) {
            const kwStem = getStem(kw);
            const kwParts = kw.split(/[\s/_\-–—]+/);
            if (kw === token) {
                bestKwScoreForToken = Math.max(bestKwScoreForToken, 8);
            } else if (kwParts.includes(token)) {
                bestKwScoreForToken = Math.max(bestKwScoreForToken, 6);
            } else if (
                tokenStem.length >= 3 && kwStem.length >= 3 &&
                (kw === tokenStem || kwStem === tokenStem || token === kwStem ||
                 kw.includes(token) || (kw.length >= 4 && token.includes(kw)))
            ) {
                bestKwScoreForToken = Math.max(bestKwScoreForToken, 5);
            }
        }
        if (bestKwScoreForToken > 0) {
            score += bestKwScoreForToken;
            tokenMatchedInEntry = true;
        }

        // Correspondance dans le titre
        const titleParts = normalizedTitle.split(/[\s/_\-–—]+/);
        if (titleParts.includes(token)) {
            score += 6;
            tokenMatchedInEntry = true;
        } else if (tokenStem.length >= 3 && (normalizedTitle.includes(token) || normalizedTitle.includes(tokenStem))) {
            score += 4;
            tokenMatchedInEntry = true;
        }

        // Correspondance dans la route (segments réels de la route)
        const routeSegments = (entry.route || '').toLowerCase().split('/').filter(Boolean);
        if (routeSegments.includes(token) || normalizedRoute.replace('/', '') === token) {
            score += 7;
            tokenMatchedInEntry = true;
        }

        // Correspondance dans le résumé
        const summaryParts = normalizedSummary.split(/[\s/_\-–—]+/);
        if (summaryParts.includes(token)) {
            score += 4;
            tokenMatchedInEntry = true;
        } else if (tokenStem.length >= 3 && (normalizedSummary.includes(token) || normalizedSummary.includes(tokenStem))) {
            score += 3;
            tokenMatchedInEntry = true;
        }

        // Correspondance dans le contenu validé
        const contentParts = normalizedContent.split(/[\s/_\-–—]+/);
        if (contentParts.includes(token)) {
            score += 3;
            tokenMatchedInEntry = true;
        } else if (tokenStem.length >= 3 && (normalizedContent.includes(token) || normalizedContent.includes(tokenStem))) {
            score += 3;
            tokenMatchedInEntry = true;
        }

        if (tokenMatchedInEntry) {
            matchedTokenCount++;
        }
    }

    // 4. Bonus de couverture conceptuelle : favorise les entrées répondant à l'ensemble des termes de la question
    if (tokens.length >= 2 && matchedTokenCount === tokens.length) {
        score += 15;
    } else if (tokens.length >= 3 && matchedTokenCount >= 2) {
        score += 8;
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
 * Calcule les tailles réelles des en-têtes, pieds et séparateurs, réserve un budget utile
 * aux entrées suivantes lorsque cela est possible, redistribue le budget inutilisé par les
 * entrées courtes et garantit des balises parfaitement fermées.
 *
 * @param {Array} entries - Les entrées sélectionnées
 * @returns {string} - Le texte formaté avec délimiteurs constants
 */
function formatKnowledgeContext(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return '';
    }

    const MIN_USEFUL_CONTENT = 60;
    const TARGET_USEFUL_RESERVATION = 80;

    // 1. Assainissement rigoureux et élimination des entrées dont les seules métadonnées dépassent le budget total
    const prepared = [];
    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;

        const title = sanitizeContentData(entry.title || '');
        // Assainir route et canonicalUrl et neutraliser tout caractère de délimitation (guillemets, chevrons, sauts de ligne)
        const route = sanitizeContentData(entry.route || '').replace(/["<>\r\n]/g, '');
        const url = sanitizeContentData(entry.canonicalUrl || '').replace(/["<>\r\n]/g, '');
        const summary = sanitizeContentData(entry.summary || '');
        const content = sanitizeContentData(entry.contentValidated || '');
        const header = `<knowledge_item route="${route}" url="${url}">\nTitre: ${title}\nRésumé: ${summary}\nContenu vérifié: `;
        const footer = `\n</knowledge_item>`;
        const metaLength = header.length + footer.length;

        // Exclure immédiatement tout bloc dont l'en-tête et le pied ne peuvent physiquement pas tenir dans le budget global
        if (metaLength > MAX_CONTEXT_LENGTH) {
            continue;
        }

        prepared.push({
            title,
            route,
            url,
            summary,
            content,
            header,
            footer,
            metaLength,
            contentLength: content.length
        });
    }

    if (prepared.length === 0) {
        return '';
    }

    // 2. Sélection du nombre maximal d'entrées pouvant être accueillies avec du contenu utile
    let targetCount = 0;
    for (let k = prepared.length; k >= 1; k--) {
        const subset = prepared.slice(0, k);
        const totalOverhead = subset.reduce((sum, item, idx) => sum + (idx > 0 ? 2 : 0) + item.metaLength, 0);
        const minContentRequired = subset.reduce((sum, item) => sum + Math.min(item.contentLength, MIN_USEFUL_CONTENT), 0);
        if (totalOverhead + minContentRequired <= MAX_CONTEXT_LENGTH) {
            targetCount = k;
            break;
        }
    }

    // Si même k=1 avec MIN_USEFUL_CONTENT ne passe pas (par ex. en-tête très lourd mais <= 2500, ou contenu vide),
    // on autorise k=1 si les métadonnées tiennent dans le budget global
    if (targetCount === 0) {
        if (prepared[0].metaLength <= MAX_CONTEXT_LENGTH) {
            targetCount = 1;
        } else {
            return '';
        }
    }

    const activeEntries = prepared.slice(0, targetCount);
    const blocks = [];
    let currentLength = 0;

    for (let i = 0; i < activeEntries.length; i++) {
        const item = activeEntries[i];
        const sep = blocks.length > 0 ? 2 : 0;
        const remainingGlobal = MAX_CONTEXT_LENGTH - currentLength - sep;

        // Si l'espace restant ne permet même pas d'insérer l'en-tête et le pied du bloc,
        // exclure proprement ce bloc afin de ne jamais tronquer ou corrompre les balises
        if (remainingGlobal < item.metaLength) {
            continue;
        }

        // Calculer la réservation utile pour les entrées suivantes
        let reservedForFuture = 0;
        for (let j = i + 1; j < activeEntries.length; j++) {
            const nextItem = activeEntries[j];
            const nextSep = 2;
            const nextUseful = Math.min(nextItem.contentLength, TARGET_USEFUL_RESERVATION);
            reservedForFuture += nextSep + nextItem.metaLength + nextUseful;
        }

        // Si la réservation cible ne laisse pas d'espace suffisant pour l'entrée courante,
        // rabattre la réservation sur le plancher strict MIN_USEFUL_CONTENT
        if (remainingGlobal - item.metaLength - reservedForFuture < MIN_USEFUL_CONTENT && activeEntries.length - 1 - i > 0) {
            reservedForFuture = 0;
            for (let j = i + 1; j < activeEntries.length; j++) {
                const nextItem = activeEntries[j];
                const nextSep = 2;
                const nextUseful = Math.min(nextItem.contentLength, MIN_USEFUL_CONTENT);
                reservedForFuture += nextSep + nextItem.metaLength + nextUseful;
            }
        }

        const maxAllowed = Math.max(0, remainingGlobal - item.metaLength - reservedForFuture);

        let content = item.content;
        if (content.length > maxAllowed) {
            if (maxAllowed <= 3) {
                content = '';
            } else {
                const sliceTarget = maxAllowed - 3;
                let truncated = content.slice(0, sliceTarget);
                const lastSpace = truncated.lastIndexOf(' ');
                if (lastSpace > sliceTarget - 25 && lastSpace > 0) {
                    truncated = truncated.slice(0, lastSpace);
                }
                content = truncated.trim() + '...';
            }
        }

        const block = `${item.header}${content}${item.footer}`;
        // Sécurité absolue : insertion conditionnelle garantissant le respect strict du budget
        if (currentLength + sep + block.length <= MAX_CONTEXT_LENGTH) {
            blocks.push(block);
            currentLength += sep + block.length;
        }
    }

    // Aucun result.slice(...) : tous les blocs retournés sont naturellement garantis fermés et conformes au budget
    return blocks.join('\n\n');
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
