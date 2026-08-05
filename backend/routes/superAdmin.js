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
    payoutAffiliate,
    updateAffiliateStatus,
    getSettings,
    updateSettings,
    getTransactions,
    getGlobalAnnouncements,
    createGlobalAnnouncement,
    getSchoolLeads,
    changeSuperAdminPassword
} = require('../controllers/superAdminController');

const {
    getSuperAdminInbox,
    sendSuperAdminMessage,
    markSuperAdminRead
} = require('../controllers/supportController');

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
router.patch('/affiliates/:id/status', authenticateToken, requireSuperAdmin, updateAffiliateStatus);

// Routes pour les fonctionnalités SaaS Globales
router.get('/settings', authenticateToken, requireSuperAdmin, getSettings);
router.put('/settings', authenticateToken, requireSuperAdmin, updateSettings);
router.get('/transactions', authenticateToken, requireSuperAdmin, getTransactions);
router.get('/leads', authenticateToken, requireSuperAdmin, getSchoolLeads);
router.get('/announcements', authenticateToken, requireSuperAdmin, getGlobalAnnouncements);
router.post('/announcements', authenticateToken, requireSuperAdmin, createGlobalAnnouncement);

// Routes pour le Support Client
router.get('/support/inbox', authenticateToken, requireSuperAdmin, getSuperAdminInbox);
router.post('/support/send/:schoolId', authenticateToken, requireSuperAdmin, sendSuperAdminMessage);
router.post('/support/read/:schoolId', authenticateToken, requireSuperAdmin, markSuperAdminRead);

// Route modification de mot de passe SuperAdmin
router.post('/change-password', authenticateToken, requireSuperAdmin, changeSuperAdminPassword);

module.exports = router;
