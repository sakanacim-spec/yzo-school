const express = require('express');
const router = express.Router();
const affiliateController = require('../controllers/affiliateController');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', affiliateController.register);
router.post('/login', affiliateController.login);

// Routes protégées
router.get('/dashboard', authenticateToken, affiliateController.getDashboard);

module.exports = router;
