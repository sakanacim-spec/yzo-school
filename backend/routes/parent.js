const router = require('express').Router();
const { authenticateToken, requireSchoolAdmin } = require('../middleware/auth');
const {
    getDashboard,
    getPayments,
    getBadges,
    getPresences,
    getActiveParentsCount,
    getAllParents,
    getParentById,
    adminDeleteAccount,
    getParentData,
    toggleDevoirComplete
} = require('../controllers/parentController');

// Routes protégées
router.use(authenticateToken);

router.get('/data', getParentData);  // Sync temps réel pour parent
router.get('/dashboard', getDashboard);
router.get('/payments/:studentId', getPayments);
router.get('/presences/:studentId', getPresences);
router.get('/badges', getBadges);
router.get('/active-count', requireSchoolAdmin, getActiveParentsCount);
router.get('/list', requireSchoolAdmin, getAllParents);
router.post('/devoir/:devoirId/complete', toggleDevoirComplete);
router.get('/:id', getParentById);
router.delete('/:parentId', adminDeleteAccount);

module.exports = router;
