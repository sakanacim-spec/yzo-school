// ============================================================
// ROUTES — Authentification
// ============================================================
const router = require('express').Router();
const { register, login, deleteSelfAccount, updatePushToken } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/update-push-token', authenticateToken, updatePushToken);
router.delete('/me', authenticateToken, deleteSelfAccount);

module.exports = router;
