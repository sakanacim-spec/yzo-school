'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('../middleware/auth');
const {
    createTransaction,
    createSaasTransaction,
    createDonationTransaction,
    fedapayWebhook
} = require('../controllers/paymentController');

// Limiteur de débit strict pour l'initialisation publique des dons
const donationRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requêtes. Veuillez réessayer plus tard.' }
});

// Route publique pour le webhook FedaPay (corps brut capturé dans server.js)
router.post('/webhook', fedapayWebhook);

// Route publique pour donateur avec rate limiting
router.post('/public/campaigns/:schoolSlug/:campaignId/donate', donationRateLimiter, createDonationTransaction);

// Routes protégées par authentification
router.use(authenticateToken);
router.post('/create-transaction', createTransaction);
router.post('/saas/schools/:slug/pay-init', createSaasTransaction);

module.exports = router;
