const express = require('express');
const WalletController = require('../controllers/WalletController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   GET /api/wallets/me
 * @desc    Get wallet(s) for current user
 * @access  Private (Student, Parent)
 */
router.get('/me', authenticateToken, WalletController.getMyWallet);

/**
 * @route   GET /api/wallets/:walletId
 * @desc    Get wallet by ID
 * @access  Private (Admin, Parent of student, Student)
 */
router.get('/:walletId', authenticateToken, WalletController.getWalletById);

/**
 * @route   GET /api/wallets/:walletId/balance
 * @desc    Get wallet balance
 * @access  Private
 */
router.get('/:walletId/balance', authenticateToken, WalletController.getWalletBalance);

/**
 * @route   GET /api/wallets/:walletId/stats
 * @desc    Get wallet statistics
 * @access  Private (Admin, Parent of student, Student)
 */
router.get('/:walletId/stats', authenticateToken, WalletController.getWalletStatistics);

/**
 * @route   POST /api/wallets
 * @desc    Create wallet for student
 * @access  Private (Admin)
 */
router.post('/', authenticateToken, authorizeRole('admin'), WalletController.createWallet);

/**
 * @route   GET /api/wallets
 * @desc    Get all wallets
 * @access  Private (Admin)
 */
router.get('/', authenticateToken, authorizeRole('admin'), WalletController.getAllWallets);

/**
 * @route   POST /api/wallets/:walletId/freeze
 * @desc    Freeze wallet
 * @access  Private (Admin, Parent)
 */
router.post('/:walletId/freeze', authenticateToken, WalletController.freezeWallet);

/**
 * @route   POST /api/wallets/:walletId/unfreeze
 * @desc    Unfreeze wallet
 * @access  Private (Admin)
 */
router.post('/:walletId/unfreeze', authenticateToken, authorizeRole('admin'), WalletController.unfreezeWallet);

module.exports = router;
