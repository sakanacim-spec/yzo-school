// ============================================================
// ROUTES — Authentification
// ============================================================
const router = require('express').Router();
const { register, registerSchool, login, deleteSelfAccount, updatePushToken, updateProfile, forgotPassword, resetPassword } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', register);
router.post('/register-school', registerSchool);
router.post('/login', login);
router.put('/profile', authenticateToken, updateProfile);
router.post('/update-push-token', authenticateToken, updatePushToken);
router.delete('/me', authenticateToken, deleteSelfAccount);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
