const router = require('express').Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { syncFromFrontend, syncToFrontend, clearPresences, clearActivityLogs, clearStudents, deleteMatiere, deleteClasseMatiere, deleteNote, deleteStudent, uploadDevoirFile } = require('../controllers/syncController');

const ALLOWED_DEVOIR_MIMES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
];
const ALLOWED_DEVOIR_EXTS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB max
        files: 1,
        fields: 5,
        parts: 10,
        fieldSize: 64 * 1024,
        fieldNameSize: 100,
        headerPairs: 50
    },
    fileFilter: (_req, file, cb) => {
        if (!file || !ALLOWED_DEVOIR_MIMES.includes(file.mimetype)) {
            return cb(new Error('Format de fichier non autorisé pour les devoirs (PDF et Images vérifiés acceptés).'));
        }
        const originalName = (file.originalname || '').toLowerCase();
        const parts = originalName.split('.');
        if (parts.length > 2) {
            const forbiddenExts = ['php', 'exe', 'sh', 'bat', 'cmd', 'js', 'html', 'svg', 'py', 'phtml', 'phar', 'vbs', 'jar'];
            for (let i = 1; i < parts.length - 1; i++) {
                if (forbiddenExts.includes(parts[i])) {
                    return cb(new Error('Nom de fichier invalide (double extension détectée).'));
                }
            }
        }
        const ext = '.' + parts[parts.length - 1];
        if (!ALLOWED_DEVOIR_EXTS.includes(ext)) {
            return cb(new Error('Extension de fichier non autorisée.'));
        }
        cb(null, true);
    }
});

// Route protégée : seuls les utilisateurs authentifiés peuvent synchroniser
router.use(authenticateToken);
router.post('/', syncFromFrontend);
router.get('/', syncToFrontend);
router.delete('/presences', clearPresences);
router.delete('/logs', clearActivityLogs);
router.delete('/students', clearStudents);

// Deletions individuelles pour académique
router.delete('/matiere/:id', deleteMatiere);
router.delete('/classe-matiere/:id', deleteClasseMatiere);
router.delete('/note/:id', deleteNote);
router.delete('/student/:id', deleteStudent);

// Upload
router.post('/upload-devoir', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (maximum 10 MB).' : (err.message || 'Erreur lors du téléversement.');
            return res.status(400).json({ error: msg });
        }
        next();
    });
}, uploadDevoirFile);

module.exports = router;
