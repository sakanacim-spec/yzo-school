const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { createTransaction, fedapayWebhook } = require('../controllers/paymentController');

// Route publique pour le webhook FedaPay
router.post('/webhook', fedapayWebhook);

// Routes protégées par authentification (Parent)
router.use(authenticateToken);
router.post('/create-transaction', createTransaction);

module.exports = router;
