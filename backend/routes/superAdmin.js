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
    impersonateSchool,
    paySubscriptionInit,
    recordDisbursement,
    updateCommissionRate,
    getAffiliates,
    payoutAffiliate
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

// Route accessible par les directeurs pour initialiser le paiement de leur abonnement SaaS via FedaPay
router.post('/schools/:slug/pay-init', authenticateToken, paySubscriptionInit);

// Routes pour la gestion des reversements et commissions
router.post('/schools/:id/disburse', authenticateToken, requireSuperAdmin, recordDisbursement);
router.patch('/schools/:id/commission', authenticateToken, requireSuperAdmin, updateCommissionRate);

// Routes pour la gestion des ambassadeurs
router.get('/affiliates', authenticateToken, requireSuperAdmin, getAffiliates);
router.post('/affiliates/:id/payout', authenticateToken, requireSuperAdmin, payoutAffiliate);


module.exports = router;
