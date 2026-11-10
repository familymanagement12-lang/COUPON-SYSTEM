const express = require('express');
const router = express.Router();
const SpendingController = require('../controllers/SpendingController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.get('/batch', authenticateToken, authorizeRole(['parent','admin']), SpendingController.getLimitsBatch);
router.get('/:studentId', authenticateToken, authorizeRole(['parent','admin']), SpendingController.getLimits);
router.post('/:studentId', authenticateToken, authorizeRole(['parent','admin']), SpendingController.setLimits);

module.exports = router;
