const express = require('express');
const router = express.Router();
const PurchaseController = require('../controllers/PurchaseController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Vendor or system can call purchase endpoint; require vendor role or allow if internal
router.post('/', authenticateToken, authorizeRole(['vendor','admin']), PurchaseController.processPurchase);

module.exports = router;
