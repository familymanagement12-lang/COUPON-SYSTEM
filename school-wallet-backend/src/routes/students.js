const express = require('express');
const StudentController = require('../controllers/StudentController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, authorizeRole('admin'), StudentController.listStudents);
router.post('/import', authenticateToken, authorizeRole('admin'), StudentController.importStudents);

module.exports = router;