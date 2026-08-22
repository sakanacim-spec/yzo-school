// ============================================================
// ROUTES — Authentification
// ============================================================
const router = require('express').Router();
const { register, registerSchool, login, deleteSelfAccount, updatePushToken, updateProfile, forgotPassword, resetPassword, updatePhone } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Trop de tentatives de connexion depuis cette IP, veuillez réessayer après 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: { error: 'Trop de demandes de réinitialisation depuis cette IP, veuillez réessayer après 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Trop de tentatives de réinitialisation depuis cette IP, veuillez réessayer après 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/register', register);
router.post('/register-school', registerSchool);
router.post('/login', loginLimiter, login);
router.put('/profile', authenticateToken, updateProfile);
router.put('/update-phone', authenticateToken, updatePhone);
router.post('/update-push-token', authenticateToken, updatePushToken);
router.delete('/me', authenticateToken, deleteSelfAccount);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);

module.exports = router;
