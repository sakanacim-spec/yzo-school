const express = require('express');
const router = express.Router();
const { chatWithAssistant } = require('../controllers/assistantController');

router.post('/chat', chatWithAssistant);

module.exports = router;
