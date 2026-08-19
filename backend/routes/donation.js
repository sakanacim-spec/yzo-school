const express = require('express');
const router = express.Router();
const donationController = require('../controllers/donationController');
const { authenticateToken, requireSchoolAdmin } = require('../middleware/auth');

// --- DIRECTOR ROUTES ---
// Requires authentication and director role
router.post('/campaigns', authenticateToken, requireSchoolAdmin, donationController.createCampaign);
router.get('/campaigns', authenticateToken, requireSchoolAdmin, donationController.getCampaigns);
router.get('/donations', authenticateToken, requireSchoolAdmin, donationController.getDonations);

// --- PUBLIC ROUTES (No authentication required) ---
router.get('/public/campaigns/:schoolSlug', donationController.getAllPublicCampaigns);
router.get('/public/campaigns/:schoolSlug/:campaignId', donationController.getPublicCampaign);
// Ancienne route d'initialisation de don neutralisée
router.post('/public/campaigns/:schoolSlug/:campaignId/donate', (_req, res) => {
    return res.status(410).json({ error: "Ce point d'accès a été déplacé vers POST /api/payment/public/campaigns/:schoolSlug/:campaignId/donate." });
});

module.exports = router;
