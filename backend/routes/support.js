const router = require('express').Router();
const { getSchoolMessages, sendSchoolMessage } = require('../controllers/supportController');
const { authenticateToken } = require('../middleware/auth');

router.get('/messages', authenticateToken, getSchoolMessages);
router.post('/send', authenticateToken, sendSchoolMessage);

module.exports = router;
