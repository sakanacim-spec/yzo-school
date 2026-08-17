const router = require('express').Router();
const { getPersonnel, createPersonnel, updateMemberPhoneByAdmin, deletePersonnel } = require('../controllers/personnelController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, getPersonnel);
router.post('/', authenticateToken, createPersonnel);
router.put('/:id/phone', authenticateToken, updateMemberPhoneByAdmin);
router.delete('/:id', authenticateToken, deletePersonnel);

module.exports = router;
