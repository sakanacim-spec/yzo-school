const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const affiliateController = require('../controllers/affiliateController');
const { authenticateToken } = require('../middleware/auth');

const affiliateAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Trop de tentatives depuis cette IP, veuillez réessayer après 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/register', affiliateAuthLimiter, affiliateController.register);
router.post('/login', affiliateAuthLimiter, affiliateController.login);

// Routes protégées
router.get('/dashboard', authenticateToken, affiliateController.getDashboard);

module.exports = router;
