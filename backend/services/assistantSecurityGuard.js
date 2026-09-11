'use strict';

/**
 * ============================================================================
 * SERVICE DE SÉCURITÉ ET FILTRAGE EN PROFONDEUR — ASSISTANT YZIOW
 * ============================================================================
 * Contrôles côté serveur étanches contre :
 * - Les injections de prompt directes / indirectes et changements de rôle
 * - Les demandes de divulgation de prompt système, clés API, secrets ou variables d'environnement
 * - Les demandes d'identité technique du modèle ou d'infrastructure
 * - Les demandes ou soumissions de données privées, scolaires ou personnelles (PII)
 * - Les contournements par encodage Base64, écriture espacée ou substitution
 *
 * RÈGLE D'OR :
 * Ne confirme ni n'infirme jamais l'existence d'une donnée, d'un secret ou d'une instruction.
 * Ne journalise jamais le texte sensible ou suspect de la requête.
 */

const PUBLIC_STANDARD_REFUSAL = "Je suis l’assistant virtuel de Yziow. Je peux vous renseigner uniquement à partir des informations publiques autorisées concernant les services de Yziow.";

// Catégories internes de refus
const REFUSAL_CATEGORIES = Object.freeze({
    PROMPT_INJECTION: 'PROMPT_INJECTION',
    SYSTEM_PROMPT_EXTRACTION: 'SYSTEM_PROMPT_EXTRACTION',
    SECRETS_CREDENTIALS: 'SECRETS_CREDENTIALS',
    MODEL_TECHNICAL_IDENTITY: 'MODEL_TECHNICAL_IDENTITY',
    PRIVATE_DATA_REQUEST: 'PRIVATE_DATA_REQUEST',
    SENSITIVE_PII_SUBMISSION: 'SENSITIVE_PII_SUBMISSION'
});

/**
 * Normalise le texte : suppression accents, casse minuscule, caractères invisibles
 */
function normalizeText(text) {
    if (typeof text !== 'string') return '';
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Retire les diacritiques
        .replace(/[\u200B-\u200D\uFEFF\u0000-\u001F\u007F-\u009F]/g, '') // Retire caractères de contrôle/invisibles
        .toLowerCase()
        .trim();
}

/**
 * Dé-espace un texte anormalement étiré (ex: "i g n o r e   a l l   p r e v i o u s")
 */
function collapseSpacedText(text) {
    if (typeof text !== 'string') return '';
    // Si les mots sont séparés par au moins 2 espaces et les lettres par un espace :
    const words = text.split(/\s{2,}|\t+/);
    const collapsedWords = words.map(w => {
        if (/^(?:[a-z0-9]\s*)+$/i.test(w.trim())) {
            return w.replace(/\s+/g, '');
        }
        return w;
    });
    return collapsedWords.join(' ');
}

/**
 * Détecte et décode de manière sécurisée les segments Base64 plausibles
 */
function extractDecodedBase64Snippets(text) {
    if (typeof text !== 'string') return [];
    const b64Regex = /[A-Za-z0-9+/]{12,}={0,2}/g;
    const matches = text.match(b64Regex) || [];
    const decoded = [];

    for (const match of matches) {
        try {
            const buf = Buffer.from(match, 'base64');
            const str = buf.toString('utf8');
            // Vérifie que la chaîne décodée est un texte ASCII/UTF8 lisible
            if (/^[\x20-\x7E\s\u00A0-\u00FF]{6,}$/.test(str)) {
                decoded.push(normalizeText(str));
                decoded.push(collapseSpacedText(normalizeText(str)));
            }
        } catch {
            // Ignorer les échecs de décodage
        }
    }
    return decoded;
}

// Expressions de détection des injections et détournements de rôle
const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|past|above)\s+instructions/i,
    /ignore\s+(toutes\s+)?(les\s+)?(consignes|instructions)(\s+precedentes)?/i,
    /oublie\s+(toutes\s+)?(tes\s+)?(consignes|instructions|regles)/i,
    /disregard\s+(all\s+)?(previous|prior)\s+(instructions|prompts)/i,
    /bypass\s+(safety|guardrails|security|filters)/i,
    /you\s+are\s+now\s+(a\s+|an\s+)?(dan|jailbreak|developer|unrestricted)/i,
    /tu\s+es\s+maintenant\s+(en\s+mode\s+)?(dan|jailbreak|developpeur|sans\s+limite)/i,
    /mode\s+(jailbreak|developpeur|dan|godmode)/i,
    /act\s+as\s+(a\s+)?(linux\s+terminal|system\s+administrator|root\s+shell|bash|python\s+repl)/i,
    /agis\s+comme\s+(un\s+)?(terminal|administrateur\s+systeme|shell|bash|serveur)/i,
    /deviens\s+(un\s+)?(administrateur|hacker|pirate|terminal|developpeur)/i,
    /switch\s+to\s+(admin|developer|god)\s+mode/i,
    /passe\s+en\s+mode\s+(admin|developpeur|superadmin)/i
];

// Motifs sans espaces pour déjouer les contournements par suppression complète d'espaces
const SPACELESS_INJECTION_PATTERNS = [
    /ignore(all)?(previous|past|above)instructions/i,
    /ignore(toutes)?(les)?(consignes|instructions)/i,
    /oublie(toutes)?(tes)?(consignes|instructions|regles)/i,
    /disregard(all)?(previous|prior)(instructions|prompts)/i,
    /bypass(safety|guardrails|security|filters)/i,
    /jailbreak|godmode/i
];

const SPACELESS_SYSTEM_PROMPT_PATTERNS = [
    /systemprompt|promptsysteme/i
];

const SPACELESS_SECRETS_PATTERNS = [
    /apikey|cleapi|clefapi|groqkey|groqapikey|service_role|servicerole/i
];

// Expressions de détection d'extraction du prompt système
const SYSTEM_PROMPT_PATTERNS = [
    /\b(system\s*prompt|prompt\s*systeme)\b/i,
    /\b(what\s+(is|are)\s+your\s+(initial\s+)?(system\s+)?instructions)\b/i,
    /\b(quelles\s+sont\s+tes\s+instructions(\s+systeme|\s+initiales|\s+cachees)?)\b/i,
    /\b(montre|affiche|revele|imprime|donne)(\s+moi)?\s+(ton\s+prompt|tes\s+instructions\s+systeme|tes\s+consignes\s+cachees)\b/i,
    /\b(repeat|print|display|show)\s+(the\s+)?(text\s+above|prompt\s+above|initial\s+system\s+prompt)\b/i,
    /\b(instructions\s+(secretes|cachees|internes))\b/i,
    /\b(hidden\s+(instructions|prompt))\b/i
];

// Expressions de détection de clés, secrets et variables d'environnement
const SECRETS_PATTERNS = [
    /\b(api[_\s-]*key|cle[_\s-]*api|clef[_\s-]*api)\b/i,
    /\b(groq[_\s-]*api[_\s-]*key|groq[_\s-]*key)\b/i,
    /\b(supabase[_\s-]*service[_\s-]*role|service[_\s-]*role[_\s-]*key)\b/i,
    /\b(process\.env|env\.[a-z0-9_]+)\b/i,
    /\b(jwt[_\s-]*secret|token[_\s-]*secret|hmac[_\s-]*secret)\b/i,
    /\b(ai_quota_hash_secret|ai_global_daily_limit)\b/i,
    /\b(database[_\s-]*password|mot[_\s-]*de[_\s-]*passe[_\s-]*bdd|db[_\s-]*password)\b/i,
    /\b(configuration[_\s-]*serveur|server[_\s-]*configuration|secrets?\s+du\s+serveur)\b/i
];

// Expressions de détection de l'identité technique du modèle / fournisseur
const MODEL_IDENTITY_PATTERNS = [
    /\b(quel\s+est\s+ton\s+modele(\s+de\s+langage)?)\b/i,
    /\b(what\s+model\s+are\s+you|which\s+llm\s+are\s+you)\b/i,
    /\b(es-tu\s+(groq|gpt|chatgpt|openai|claude|gemini|llama|mistral|deepseek))\b/i,
    /\b(are\s+you\s+(groq|gpt|chatgpt|openai|claude|gemini|llama|mistral|deepseek))\b/i,
    /\b(qui\s+t'a\s+concu|who\s+created\s+you|who\s+built\s+you|qui\s+t'a\s+entraine)\b/i,
    /\b(fournisseur\s+(ia|d'ia|du\s+modele)|ai\s+provider|technologie\s+du\s+modele)\b/i,
    /\b(gpt-oss|gpt-oss-20b|groq-sdk)\b/i
];

// Expressions de détection de demandes de données privées / scolaires
const PRIVATE_DATA_PATTERNS = [
    /\b(liste|noms?|coordonnees|adresses?)\s+(des?\s+)?(eleves?|etudiants?|parents?|professeurs?|profs?|enseignants?)\b/i,
    /\b(notes?|bulletins?|moyennes?|absences?)\s+(de\s+l'eleve|des\s+eleves?)\b/i,
    /\b(mot\s+de\s+passe|identifiants?)\s+(des?\s+)?(ecoles?|utilisateurs?|comptes?|directeurs?)\b/i,
    /\b(salaires?|remuneration)\s+(du\s+personnel|des\s+profs?|des\s+enseignants?)\b/i,
    /\b(donnees?\s+(privees?|scolaires?|personnelles?|confidentielles?))\b/i,
    /\b(base\s+de\s+donnees\s+des\s+eleves|student\s+records|parent\s+records)\b/i
];

// Expressions de détection de PII transmises (Numéros de téléphones réels, Emails réels, Mots de passe transmis)
// Note : Ne PAS bloquer les questions sur "le téléphone" ou "par téléphone".
const PII_PATTERNS = [
    // Adresse email réelle dans la question
    /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
    // Numéro de téléphone international ou local réel (ex: +33 6 12 34 56 78, +229 97 00 00 00, 0612345678)
    /(?:\+|00)[1-9][0-9\s.-]{6,20}\d/,
    /\b0[1-9](?:[\s.-]?\d{2}){4}\b/,
    // Transmission directe d'un mot de passe ou d'un token secret
    /\b(mon\s+mot\s+de\s+passe|my\s+password|pass|mdp)\s*[:=]\s*[^\s]{4,}\b/i,
    /\beyj[a-za-z0-9_-]{10,}\.[a-za-z0-9_-]{10,}\b/i // Structure JWT
];

/**
 * Analyse une chaîne de caractères contre les différentes catégories de menaces
 */
function testSecurityPatterns(text) {
    if (!text || typeof text !== 'string') return null;

    const normalized = normalizeText(text);
    const collapsed = collapseSpacedText(normalized);
    const spaceless = normalized.replace(/\s+/g, '');
    const base64Decoded = extractDecodedBase64Snippets(text);

    const candidates = [normalized, collapsed, ...base64Decoded];

    for (const candidate of candidates) {
        // 1. Injections directes / changements de rôle
        for (const pattern of INJECTION_PATTERNS) {
            if (pattern.test(candidate)) {
                return REFUSAL_CATEGORIES.PROMPT_INJECTION;
            }
        }

        // 2. Demandes de prompt système
        for (const pattern of SYSTEM_PROMPT_PATTERNS) {
            if (pattern.test(candidate)) {
                return REFUSAL_CATEGORIES.SYSTEM_PROMPT_EXTRACTION;
            }
        }

        // 3. Secrets et clés API
        for (const pattern of SECRETS_PATTERNS) {
            if (pattern.test(candidate)) {
                return REFUSAL_CATEGORIES.SECRETS_CREDENTIALS;
            }
        }

        // 4. Identité technique du modèle
        for (const pattern of MODEL_IDENTITY_PATTERNS) {
            if (pattern.test(candidate)) {
                return REFUSAL_CATEGORIES.MODEL_TECHNICAL_IDENTITY;
            }
        }

        // 5. Données scolaires ou privées
        for (const pattern of PRIVATE_DATA_PATTERNS) {
            if (pattern.test(candidate)) {
                return REFUSAL_CATEGORIES.PRIVATE_DATA_REQUEST;
            }
        }

        // 6. Présence de PII / secrets transmis
        for (const pattern of PII_PATTERNS) {
            if (pattern.test(candidate)) {
                return REFUSAL_CATEGORIES.SENSITIVE_PII_SUBMISSION;
            }
        }
    }

    // Vérifications anti-obfuscation sans espace (en cas d'écritures fusionnées ou espacées)
    for (const pattern of SPACELESS_INJECTION_PATTERNS) {
        if (pattern.test(spaceless)) {
            return REFUSAL_CATEGORIES.PROMPT_INJECTION;
        }
    }
    for (const pattern of SPACELESS_SYSTEM_PROMPT_PATTERNS) {
        if (pattern.test(spaceless)) {
            return REFUSAL_CATEGORIES.SYSTEM_PROMPT_EXTRACTION;
        }
    }
    for (const pattern of SPACELESS_SECRETS_PATTERNS) {
        if (pattern.test(spaceless)) {
            return REFUSAL_CATEGORIES.SECRETS_CREDENTIALS;
        }
    }

    return null;
}

/**
 * Examine tous les messages soumis par l'utilisateur pour détecter toute menace.
 * Inspecte exhaustivement tous les messages de rôle 'user' de l'historique.
 * Ignore les rôles forgés par le client.
 *
 * @param {Array} messages - Tableau de messages [{ role/sender, content/text }]
 * @returns {{ isSafe: boolean, refusalCategory?: string, publicRefusalMessage: string }}
 */
function inspectRequest(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return {
            isSafe: true,
            publicRefusalMessage: PUBLIC_STANDARD_REFUSAL
        };
    }

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg || typeof msg !== 'object') continue;

        const role = (msg.sender || msg.role || '').toLowerCase().trim();
        // Vérifie les messages utilisateur
        if (role === 'user') {
            const content = msg.text !== undefined ? msg.text : msg.content;
            if (typeof content === 'string') {
                const refusalCategory = testSecurityPatterns(content);
                if (refusalCategory) {
                    // Journalise UNIQUEMENT la catégorie sans AUCUNE donnée utilisateur
                    console.warn(`[SECURITY_GUARD] Requête bloquée. Catégorie: ${refusalCategory}`);
                    return {
                        isSafe: false,
                        refusalCategory,
                        publicRefusalMessage: PUBLIC_STANDARD_REFUSAL
                    };
                }
            }
        }
    }

    return {
        isSafe: true,
        publicRefusalMessage: PUBLIC_STANDARD_REFUSAL
    };
}

module.exports = {
    PUBLIC_STANDARD_REFUSAL,
    REFUSAL_CATEGORIES,
    normalizeText,
    collapseSpacedText,
    testSecurityPatterns,
    inspectRequest
};
