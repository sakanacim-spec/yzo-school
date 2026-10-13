// Director routes for parent‑student link requests
// ---------------------------------------------------
// Endpoints (all under /api/director):
//   GET    /requests                → list pending & verification requests
//   GET    /requests/:id            → detail of a single request
//   POST   /requests/:id/approve    → approve a request via RPC
//   POST   /requests/:id/reject     → reject a request via RPC (requires reason)

const router = require('express').Router();
const { authenticateToken, requireSchool } = require('../middleware/auth');
const directorController = require('../controllers/directorController');

// Apply authentication & school context to all routes
router.use(authenticateToken);
router.use(requireSchool);

router.get('/requests', directorController.listRequests);
router.get('/requests/:id', directorController.getRequest);
router.post('/requests/:id/approve', directorController.approveRequest);
router.post('/requests/:id/reject', directorController.rejectRequest);

module.exports = router;
