const router = require('express').Router();
const multer = require('multer');
const { getConversations, getMessages, sendMessage, uploadImage, getUnreadCount, initiateConversation, deleteConversation } = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/conversations', authenticateToken, getConversations);
router.get('/messages/:conversationId', authenticateToken, getMessages);
router.get('/unread', authenticateToken, getUnreadCount);
router.post('/initiate', authenticateToken, initiateConversation);
router.post('/send', authenticateToken, sendMessage);
router.post('/upload', authenticateToken, upload.single('image'), uploadImage);
router.delete('/conversation/:id', authenticateToken, deleteConversation);

module.exports = router;
