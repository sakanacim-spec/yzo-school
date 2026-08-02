const express = require('express');
const router = express.Router();
const donationController = require('../controllers/donationController');
const { verifyToken, checkRole } = require('../middleware/auth');

// --- DIRECTOR ROUTES ---
// Requires authentication and director role
router.post('/campaigns', verifyToken, checkRole(['director']), donationController.createCampaign);
router.get('/campaigns', verifyToken, checkRole(['director']), donationController.getCampaigns);
router.get('/donations', verifyToken, checkRole(['director']), donationController.getDonations);

// --- PUBLIC ROUTES (No authentication required) ---
router.get('/public/campaigns/:schoolSlug', donationController.getAllPublicCampaigns);
router.get('/public/campaigns/:schoolSlug/:campaignId', donationController.getPublicCampaign);
router.post('/public/campaigns/:schoolSlug/:campaignId/donate', donationController.initiateDonation);

module.exports = router;
