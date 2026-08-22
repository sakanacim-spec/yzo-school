const router = require('express').Router();
const multer = require('multer');
const { getConversations, getMessages, sendMessage, uploadImage, getUnreadCount, initiateConversation, deleteConversation } = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/auth');

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB max
        files: 1,
        fields: 5,
        parts: 10,
        fieldSize: 64 * 1024,
        fieldNameSize: 100,
        headerPairs: 50
    },
    fileFilter: (_req, file, cb) => {
        if (!file || !ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
            return cb(new Error('Format d\'image non supporté. Types autorisés : JPEG, PNG, WEBP, GIF.'));
        }
        const originalName = (file.originalname || '').toLowerCase();
        const parts = originalName.split('.');
        if (parts.length > 2) {
            const forbiddenExts = ['php', 'exe', 'sh', 'bat', 'cmd', 'js', 'html', 'svg', 'py', 'phtml', 'phar', 'vbs'];
            for (let i = 1; i < parts.length - 1; i++) {
                if (forbiddenExts.includes(parts[i])) {
                    return cb(new Error('Nom de fichier invalide (double extension détectée).'));
                }
            }
        }
        const ext = '.' + parts[parts.length - 1];
        if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
            return cb(new Error('Extension de fichier d\'image non autorisée.'));
        }
        cb(null, true);
    }
});

router.get('/conversations', authenticateToken, getConversations);
router.get('/messages/:conversationId', authenticateToken, getMessages);
router.get('/unread', authenticateToken, getUnreadCount);
router.post('/initiate', authenticateToken, initiateConversation);
router.post('/send', authenticateToken, sendMessage);
router.post('/upload', authenticateToken, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (maximum 5 MB).' : (err.message || 'Erreur lors du téléversement.');
            return res.status(400).json({ error: msg });
        }
        next();
    });
}, uploadImage);
router.delete('/conversation/:id', authenticateToken, deleteConversation);

module.exports = router;
