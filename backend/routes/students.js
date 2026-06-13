// ============================================================
// ROUTE — Upload photo passeport d'un élève
// POST /api/students/upload-photo/:studentId
// ============================================================
'use strict';
const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { listStudents, linkStudentToParent, unlinkStudentFromParent, countStudents } = require('../controllers/studentsController');
const { uploadStudentPhoto } = require('../controllers/photoController');

// Routes existantes
router.get('/', authenticateToken, listStudents);
router.get('/count', authenticateToken, countStudents);
router.post('/link', authenticateToken, linkStudentToParent);
router.delete('/unlink/:studentId', authenticateToken, unlinkStudentFromParent);

// ── Nouvelle route : Upload photo passeport ──────────────────
// Le payload JSON contient { imageBase64: "data:image/...;base64,..." }
router.post('/upload-photo/:studentId', authenticateToken, uploadStudentPhoto);

module.exports = router;
