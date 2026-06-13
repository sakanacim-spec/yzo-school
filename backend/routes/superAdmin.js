// ============================================================
// ROUTES SUPER ADMIN — Plateforme SaaS
// ============================================================
const router = require('express').Router();
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth');
const {
    getAllSchools,
    createSchool,
    updateSchoolStatus,
    updateSchool,
    deleteSchool,
    getGlobalStats,
    impersonateSchool
} = require('../controllers/superAdminController');

// Toutes ces routes sont protégées par le double middleware :
// 1. authenticateToken : vérifie le JWT
// 2. requireSuperAdmin : vérifie que le rôle est 'superadmin'

router.get('/stats', authenticateToken, requireSuperAdmin, getGlobalStats);
router.get('/schools', authenticateToken, requireSuperAdmin, getAllSchools);
router.post('/schools', authenticateToken, requireSuperAdmin, createSchool);
router.put('/schools/:id', authenticateToken, requireSuperAdmin, updateSchool);
router.patch('/schools/:id/status', authenticateToken, requireSuperAdmin, updateSchoolStatus);
router.delete('/schools/:id', authenticateToken, requireSuperAdmin, deleteSchool);
router.post('/schools/:id/impersonate', authenticateToken, requireSuperAdmin, impersonateSchool);

module.exports = router;
