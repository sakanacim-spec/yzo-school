// ============================================================
// ROUTES — Authentification
// ============================================================
const router = require('express').Router();
const { register, registerSchool, login, deleteSelfAccount, updatePushToken, updateProfile, forgotPassword, resetPassword, updatePhone } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limiter chaque IP à 10 requêtes par `window` (15 minutes)
    message: { error: 'Trop de tentatives de connexion depuis cette IP, veuillez réessayer après 15 minutes.' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

router.post('/register', register);
router.post('/register-school', registerSchool);
router.post('/login', loginLimiter, login);
router.put('/profile', authenticateToken, updateProfile);
router.put('/update-phone', authenticateToken, updatePhone);
router.post('/update-push-token', authenticateToken, updatePushToken);
router.delete('/me', authenticateToken, deleteSelfAccount);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
