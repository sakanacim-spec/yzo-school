const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { sendNotification, broadcastAnnouncement } = require('../controllers/notificationController');

// POST /api/notifications/send — Notifier les parents d'un élève spécifique
router.post('/send', authenticateToken, sendNotification);

// POST /api/notifications/broadcast-announcement — Broadcast à tous les parents
router.post('/broadcast-announcement', authenticateToken, broadcastAnnouncement);

module.exports = router;
