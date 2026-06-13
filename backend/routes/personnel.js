const router = require('express').Router();
const { getPersonnel, createPersonnel, deletePersonnel } = require('../controllers/personnelController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, getPersonnel);
router.post('/', authenticateToken, createPersonnel);
router.delete('/:id', authenticateToken, deletePersonnel);

module.exports = router;
