const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const {
    getDashboard,
    getPayments,
    getBadges,
    getPresences,
    getActiveParentsCount,
    getAllParents,
    getParentById,
    adminDeleteAccount,
    getParentData
} = require('../controllers/parentController');

// Routes protégées
router.use(authenticateToken);

router.get('/data', getParentData);  // Sync temps réel pour parent
router.get('/dashboard', getDashboard);
router.get('/payments/:studentId', getPayments);
router.get('/presences/:studentId', getPresences);
router.get('/badges', getBadges);
router.get('/active-count', getActiveParentsCount);
router.get('/list', getAllParents);
router.get('/:id', getParentById);
router.delete('/:parentId', adminDeleteAccount);

module.exports = router;
