const express = require('express');
const AuthController = require('../controllers/AuthController');
const { authenticateToken, authorizeSuperAdmin, optionalAuth, rateLimiter } = require('../middleware/auth');

const router = express.Router();

// Apply rate limiter to auth routes (100 requests per 15 minutes)
router.use(rateLimiter(15 * 60 * 1000, 100));

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 * @body    {username, email, phone, password, confirmPassword, role, firstName, lastName}
 */
router.post('/register', optionalAuth, AuthController.register);
router.get('/super-admins', authenticateToken, authorizeSuperAdmin, AuthController.listSuperAdmins);
router.post('/super-admins', authenticateToken, authorizeSuperAdmin, AuthController.createSuperAdmin);
router.post('/super-admins/promote', authenticateToken, authorizeSuperAdmin, AuthController.promoteSuperAdmin);

/**
 * @route   POST /api/auth/login
 * @desc    Login user and get tokens
 * @access  Public
 * @body    {identifier (email/username), password}
 */
router.post('/login', AuthController.login);
router.post('/forgot-password', rateLimiter(15 * 60 * 1000, 5), AuthController.forgotPassword);
router.post('/reset-password', rateLimiter(15 * 60 * 1000, 10), AuthController.resetPassword);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token using refresh token
 * @access  Public
 * @body    {refreshToken}
 */
router.post('/refresh-token', AuthController.refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticateToken, AuthController.logout);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticateToken, AuthController.getCurrentUser);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 * @body    {currentPassword, newPassword, confirmPassword}
 */
router.post('/change-password', authenticateToken, AuthController.changePassword);

module.exports = router;
