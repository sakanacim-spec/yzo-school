const express = require('express');
const router = express.Router();
const { authenticateToken, requireSchoolAdmin, requireSuperAdmin } = require('../middleware/auth');
const withdrawalController = require('../controllers/withdrawalController');

// --- DIRECTOR ROUTES ---
// Requires authentication and director role
router.get('/', authenticateToken, requireSchoolAdmin, withdrawalController.getSchoolWithdrawals);
router.post('/', authenticateToken, requireSchoolAdmin, withdrawalController.requestWithdrawal);

// --- SUPERADMIN ROUTES ---
// Requires authentication and superadmin role
router.get('/all', authenticateToken, requireSuperAdmin, withdrawalController.getSuperAdminWithdrawals);
router.put('/:id/status', authenticateToken, requireSuperAdmin, withdrawalController.updateWithdrawalStatus);

module.exports = router;
