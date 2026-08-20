'use strict';
const crypto = require('crypto');
const { supabase } = require('./supabase');

const DEFAULT_GLOBAL_DAILY_LIMIT = 1000;

/**
 * Récupère et valide le secret de hachage des quotas
 */
function getQuotaHashSecret() {
    const secret = process.env.AI_QUOTA_HASH_SECRET;
    if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
        throw new Error('CONFIGURATION_INVALIDE: AI_QUOTA_HASH_SECRET doit comporter au moins 32 caractères.');
    }
    return secret.trim();
}

/**
 * Valide et extrait la limite globale journalière
 */
function getGlobalDailyLimit() {
    const raw = process.env.AI_GLOBAL_DAILY_LIMIT;
    if (raw === undefined || raw === null || raw === '') {
        return DEFAULT_GLOBAL_DAILY_LIMIT;
    }
    const trimmed = String(raw).trim();
    if (!/^\d+$/.test(trimmed)) {
        throw new Error('CONFIGURATION_INVALIDE: AI_GLOBAL_DAILY_LIMIT doit être un entier strict.');
    }
    const num = Number(trimmed);
    if (!Number.isSafeInteger(num) || num < 1 || num > 100000) {
        throw new Error('CONFIGURATION_INVALIDE: AI_GLOBAL_DAILY_LIMIT doit être compris entre 1 et 100000.');
    }
    return num;
}

/**
 * Hache un identifiant (IP ou User ID) de manière irréversible via HMAC-SHA256
 */
function hashQuotaSubject(identifier) {
    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
        throw new Error('IDENTIFIANT_QUOTA_INVALIDE');
    }
    const secret = getQuotaHashSecret();
    return crypto.createHmac('sha256', secret).update(identifier.trim()).digest('hex');
}

/**
 * Extrait l'adresse IP cliente de façon fiable derrière un reverse-proxy
 */
function getClientIp(req) {
    if (!req) return '127.0.0.1';
    if (req.ip && typeof req.ip === 'string') return req.ip;
    const forwarded = req.headers ? req.headers['x-forwarded-for'] : null;
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    if (req.socket && req.socket.remoteAddress) {
        return req.socket.remoteAddress;
    }
    return '127.0.0.1';
}

/**
 * Valide strictement la structure des messages d'un chat
 */
function validateChatMessages(messages) {
    if (!messages || !Array.isArray(messages)) {
        return { isValid: false, error: "Le paramètre 'messages' doit être un tableau." };
    }

    if (messages.length === 0) {
        return { isValid: false, error: 'Le tableau des messages ne peut pas être vide.' };
    }

    if (messages.length > 10) {
        return { isValid: false, error: "L'historique des messages ne peut pas dépasser 10 éléments." };
    }

    const validSenders = ['user', 'assistant', 'bot'];

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
            return { isValid: false, error: `Le message à l'index ${i} est invalide.` };
        }

        const sender = msg.sender || msg.role;
        if (!sender || typeof sender !== 'string' || !validSenders.includes(sender.toLowerCase())) {
            return { isValid: false, error: `Rôle ou expéditeur invalide pour le message à l'index ${i}.` };
        }

        const text = msg.text !== undefined ? msg.text : msg.content;
        if (typeof text !== 'string') {
            return { isValid: false, error: `Le contenu du message à l'index ${i} doit être une chaîne de caractères.` };
        }

        const trimmed = text.trim();
        if (i === messages.length - 1 && trimmed.length === 0) {
            return { isValid: false, error: 'La dernière question ne peut pas être vide.' };
        }

        if (text.length > 1000) {
            return { isValid: false, error: `Le message à l'index ${i} dépasse la limite autorisée de 1000 caractères.` };
        }
    }

    return { isValid: true };
}

/**
 * Valide strictement les paramètres du feedback pédagogique
 */
function validatePedagogicalInput(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { isValid: false, error: 'Corps de requête invalide.' };
    }

    const { studentName, matiere, notes } = body;

    if (!studentName || typeof studentName !== 'string' || !studentName.trim() || studentName.trim().length > 100) {
        return { isValid: false, error: "Le nom de l'élève est requis (maximum 100 caractères)." };
    }

    if (!matiere || typeof matiere !== 'string' || !matiere.trim() || matiere.trim().length > 100) {
        return { isValid: false, error: 'La matière est requise (maximum 100 caractères).' };
    }

    if (!notes || !Array.isArray(notes) || notes.length === 0 || notes.length > 20) {
        return { isValid: false, error: 'Le tableau des notes doit contenir entre 1 et 20 éléments.' };
    }

    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (typeof n !== 'number' && typeof n !== 'string') {
            return { isValid: false, error: `La note à l'index ${i} est invalide.` };
        }
        if (typeof n === 'string' && n.trim().length > 50) {
            return { isValid: false, error: `La note à l'index ${i} est trop longue.` };
        }
    }

    return { isValid: true, studentName: studentName.trim(), matiere: matiere.trim(), notes };
}

/**
 * Journalisation sécurisée sans données personnelles ni secrets
 */
function logQuotaDecision(scope, subjectHash, decision) {
    const truncatedHash = subjectHash ? `${subjectHash.slice(0, 8)}...` : 'unknown';
    const logData = {
        scope,
        subject: truncatedHash,
        allowed: decision.allowed,
        reason: decision.reason,
        retryAfter: decision.retry_after_seconds,
        timestamp: new Date().toISOString()
    };
    if (!decision.allowed) {
        console.warn('[AI_QUOTA_REJECTED]', JSON.stringify(logData));
    }
}

/**
 * Contrôle et consomme un quota IA de manière atomique via Supabase RPC
 */
async function enforceQuota({ scope, subjectIdentifier, hourLimit = null, dayLimit, customNow = null }) {
    const globalDayLimit = getGlobalDailyLimit();
    const subjectHash = hashQuotaSubject(subjectIdentifier);

    const { data: result, error: rpcError } = await supabase.rpc('consume_assistant_quota', {
        p_subject_scope: scope,
        p_subject_hash: subjectHash,
        p_now: customNow || new Date().toISOString(),
        p_subject_hour_limit: hourLimit,
        p_subject_day_limit: dayLimit,
        p_global_day_limit: globalDayLimit
    });

    if (rpcError) {
        console.error('[AI_QUOTA_RPC_ERROR]', JSON.stringify({ code: rpcError.code, scope }));
        // En cas d'indisponibilité RPC, fail-closed sécurisé
        return {
            allowed: false,
            status: 503,
            response: {
                error: "L'assistant est temporairement indisponible.",
                code: 'AI_SERVICE_UNAVAILABLE',
                retryAfter: 60
            },
            retryAfter: 60
        };
    }

    logQuotaDecision(scope, subjectHash, result);

    if (!result || !result.allowed) {
        const isGlobal = result?.reason === 'GLOBAL_DAILY_LIMIT_EXCEEDED';
        const retryAfter = result?.retry_after_seconds || (isGlobal ? 3600 : 60);

        if (isGlobal) {
            return {
                allowed: false,
                status: 503,
                response: {
                    error: "L'assistant est temporairement indisponible.",
                    code: 'AI_GLOBAL_QUOTA_EXCEEDED',
                    retryAfter
                },
                retryAfter
            };
        }

        return {
            allowed: false,
            status: 429,
            response: {
                error: "Quota de l'assistant atteint. Veuillez réessayer plus tard.",
                code: 'AI_USER_QUOTA_EXCEEDED',
                retryAfter
            },
            retryAfter
        };
    }

    return {
        allowed: true,
        remaining: result.remaining
    };
}

module.exports = {
    getQuotaHashSecret,
    getGlobalDailyLimit,
    hashQuotaSubject,
    getClientIp,
    validateChatMessages,
    validatePedagogicalInput,
    enforceQuota
};
