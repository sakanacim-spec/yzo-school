const router = require('express').Router();
const { getPublicSettings } = require('../controllers/settingsController');

// Route publique (pas d'authenticateToken ici)
router.get('/', getPublicSettings);

module.exports = router;
