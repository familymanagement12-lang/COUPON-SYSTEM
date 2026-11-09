const express = require('express');
const ParentController = require('../controllers/ParentController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken, authorizeRole('parent'));
router.get('/me/students', ParentController.getChildren);
router.post('/me/students', ParentController.linkStudent);

module.exports = router;