// ============================================================
// ROUTES — Annonces (temps réel + push web)
// ============================================================
const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { createAnnouncement, getAnnouncements, deleteAnnouncement, acknowledgeRead } = require('../controllers/announcementController');

// Toutes les routes requièrent une authentification
router.use(authenticateToken);

// GET  /api/announcements        → Liste des annonces (admin + parent)
router.get('/', getAnnouncements);

// POST /api/announcements        → Créer + notifier (admin seulement)
router.post('/', createAnnouncement);

// POST /api/announcements/:id/read → Marquer comme lu (parent seulement)
router.post('/:id/read', acknowledgeRead);

// DELETE /api/announcements/:id  → Supprimer (admin seulement)
router.delete('/:id', deleteAnnouncement);

module.exports = router;
