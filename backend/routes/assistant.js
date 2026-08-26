'use strict';
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    chatWithAssistant,
    chatWithPrivateAssistant,
    generatePedagogicalFeedback
} = require('../controllers/assistantController');

const rateLimit = require('express-rate-limit');

/**
 * Extraction et normalisation sécurisée de l'identifiant IP client pour le rate limiting local.
 * Priorité à l'en-tête officiel 'x-vercel-forwarded-for' injecté par le Edge Vercel.
 * Fallback sécurisé sur req.ip / remoteAddress en environnement local.
 */
function getClientIpForRateLimit(req) {
    const vercelForwarded = req.headers && req.headers['x-vercel-forwarded-for'];
    if (typeof vercelForwarded === 'string' && vercelForwarded.trim()) {
        const rawIp = vercelForwarded.split(',')[0].trim();
        if (rawIp) {
            return rawIp.startsWith('::ffff:') ? rawIp.substring(7) : rawIp.toLowerCase();
        }
    }

    const fallbackIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    return fallbackIp.startsWith('::ffff:') ? fallbackIp.substring(7) : String(fallbackIp).toLowerCase();
}

// Rate limiter anti-abus HTTP général (best-effort local par instance serveur)
const publicAssistantLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60, // 60 requêtes par fenêtre de 15 minutes par IP
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIpForRateLimit(req),
    message: {
        error: "Trop de requêtes vers l'assistant depuis cette adresse IP. Veuillez réessayer dans quelques minutes."
    }
});

// Route publique (Chatbot d'accueil / Visiteurs)
router.post('/chat', publicAssistantLimiter, chatWithAssistant);

// Routes privées (Dashboards / Utilisateurs authentifiés)
router.post('/private', authenticateToken, chatWithPrivateAssistant);
router.post('/private-chat', authenticateToken, chatWithPrivateAssistant);

// Routes pédagogiques (Appréciations de bulletins / Enseignants)
router.post('/pedagogy', authenticateToken, generatePedagogicalFeedback);
router.post('/pedagogical-feedback', authenticateToken, generatePedagogicalFeedback);

router._getClientIpForRateLimit = getClientIpForRateLimit;

module.exports = router;
