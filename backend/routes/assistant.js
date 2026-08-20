'use strict';
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    chatWithAssistant,
    chatWithPrivateAssistant,
    generatePedagogicalFeedback
} = require('../controllers/assistantController');

// Route publique (Chatbot d'accueil / Visiteurs)
router.post('/chat', chatWithAssistant);

// Routes privées (Dashboards / Utilisateurs authentifiés)
router.post('/private', authenticateToken, chatWithPrivateAssistant);
router.post('/private-chat', authenticateToken, chatWithPrivateAssistant);

// Routes pédagogiques (Appréciations de bulletins / Enseignants)
router.post('/pedagogy', authenticateToken, generatePedagogicalFeedback);
router.post('/pedagogical-feedback', authenticateToken, generatePedagogicalFeedback);

module.exports = router;
