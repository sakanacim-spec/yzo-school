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
router.post('/public/campaigns/:schoolSlug/:campaignId/donate', donationController.initiateDonation);

module.exports = router;
