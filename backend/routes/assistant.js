const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { chatWithAssistant, chatWithPrivateAssistant, generatePedagogicalFeedback } = require('../controllers/assistantController');

// Route publique (Chatbot d'accueil)
router.post('/chat', chatWithAssistant);

// Routes privées (Dashboards)
router.post('/private', authenticateToken, chatWithPrivateAssistant);
router.post('/pedagogy', authenticateToken, generatePedagogicalFeedback);

module.exports = router;
