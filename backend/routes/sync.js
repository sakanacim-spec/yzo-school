// ============================================================
// ROUTES — Synchronisation
// ============================================================
const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { syncFromFrontend, syncToFrontend, clearPresences, clearActivityLogs, clearStudents, deleteMatiere, deleteClasseMatiere, deleteNote, deleteStudent } = require('../controllers/syncController');

// Route protégée : seuls les utilisateurs authentifiés (directeur/comptable) peuvent synchroniser
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

module.exports = router;
