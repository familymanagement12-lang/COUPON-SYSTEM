const express = require('express');
const router = express.Router();
const TransactionController = require('../controllers/TransactionController');
const { authenticateToken, authorizeRole, authorizeSuperAdmin } = require('../middleware/auth');

router.get('/all', authenticateToken, authorizeSuperAdmin, TransactionController.getAllHistory);
router.get('/history', authenticateToken, authorizeRole(['parent','admin','vendor']), TransactionController.getHistory);

module.exports = router;
