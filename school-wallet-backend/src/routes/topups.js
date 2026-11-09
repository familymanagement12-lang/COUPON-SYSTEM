const express = require('express');
const TopUpController = require('../controllers/TopUpController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   GET /api/topups/methods
 * @desc    Get available payment methods
 * @access  Public
 */
router.get('/methods', TopUpController.getPaymentMethods);

/**
 * @route   POST /api/topups
 * @desc    Initiate a top-up transaction
 * @access  Private (Parent)
 */
router.post('/', authenticateToken, authorizeRole('parent'), TopUpController.initiateTopUp);

/**
 * @route   POST /api/topups/complete
 * @desc    Complete top-up (from payment webhook)
 * @access  Public (with webhook validation)
 */
router.post('/complete', authenticateToken, authorizeRole('parent'), TopUpController.completeTopUp);

router.get('/verify/:reference', authenticateToken, authorizeRole('parent'), TopUpController.verifyTopUp);

/**
 * @route   POST /api/topups/webhook
 * @desc    Payment provider webhook callback
 * @access  Public (with signature validation)
 */
router.post('/webhook', TopUpController.handlePaymentWebhook);

/**
 * @route   GET /api/topups/history
 * @desc    Get top-up history for parent
 * @access  Private (Parent)
 */
router.get('/history', authenticateToken, authorizeRole('parent'), TopUpController.getTopUpHistory);

/**
 * @route   GET /api/topups/stats
 * @desc    Get top-up statistics for parent
 * @access  Private (Parent)
 */
router.get('/stats', authenticateToken, authorizeRole('parent'), TopUpController.getTopUpStats);

/**
 * @route   GET /api/topups/admin/all
 * @desc    Get all top-ups (Admin)
 * @access  Private (Admin)
 */
router.get('/admin/all', authenticateToken, authorizeRole('admin'), TopUpController.getAllTopUps);

/**
 * @route   POST /api/topups/:topUpId/cancel
 * @desc    Cancel pending top-up
 * @access  Private (Parent - own only, Admin)
 */
router.post('/:topUpId/cancel', authenticateToken, TopUpController.cancelTopUp);

module.exports = router;
