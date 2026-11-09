const express = require('express');
const router = express.Router();
const VendorController = require('../controllers/VendorController');
const { authenticateToken, authorizeRole, authorizeSuperAdmin } = require('../middleware/auth');

router.post('/', authenticateToken, authorizeSuperAdmin, VendorController.register);
router.get('/:vendorId/summary', authenticateToken, authorizeRole(['admin','vendor']), VendorController.getSummary);
router.get('/:vendorId', authenticateToken, authorizeRole(['admin','vendor']), VendorController.getVendor);
router.get('/:vendorId/transactions', authenticateToken, authorizeRole(['admin','vendor']), VendorController.getTransactions);

module.exports = router;
