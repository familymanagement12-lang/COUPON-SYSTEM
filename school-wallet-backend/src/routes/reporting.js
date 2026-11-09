const express = require('express');
const router = express.Router();
const ReportingController = require('../controllers/ReportingController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.get('/financial-summary', authenticateToken, authorizeRole(['admin']), ReportingController.financialSummary);

module.exports = router;
