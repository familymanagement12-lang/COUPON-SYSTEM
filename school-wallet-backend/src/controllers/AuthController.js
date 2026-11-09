const User = require('../models/User');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Vendor = require('../models/Vendor');
const Wallet = require('../models/Wallet');
const JWTUtil = require('../utils/jwt');
const ResponseHandler = require('../utils/response');
const { query } = require('../config/database');
const { isSuperAdmin } = require('../middleware/auth');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

class AuthController {
  static async forgotPassword(req, res) {
    try {
      const identifier = String(req.body?.identifier || '').trim();
      if (!identifier) return ResponseHandler.badRequest(res, 'Email or username is required');

      const emailResult = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [identifier]);
      const user = emailResult.rows[0] || await User.findByUsername(identifier);
      const response = { message: 'If an account matches, password reset instructions have been created.' };
      if (!user || user.status === 'deleted') return ResponseHandler.success(res, response.message, response);

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await query('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 minutes')`,
        [user.id, tokenHash]
      );

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;
      console.log(`Password reset link for ${user.email}: ${resetUrl}`);
      if (process.env.NODE_ENV !== 'production') response.resetUrl = resetUrl;
      return ResponseHandler.success(res, response.message, response);
    } catch (error) {
      console.error('Forgot password error:', error);
      return ResponseHandler.serverError(res, 'Unable to create password reset request');
    }
  }

  static async resetPassword(req, res) {
    const client = await require('../config/database').getClient();
    try {
      const { token, newPassword, confirmPassword } = req.body;
      if (!token || !newPassword || !confirmPassword) return ResponseHandler.badRequest(res, 'Token and all password fields are required');
      if (newPassword !== confirmPassword) return ResponseHandler.badRequest(res, 'Passwords do not match');
      if (newPassword.length < 8) return ResponseHandler.badRequest(res, 'Password must be at least 8 characters long');

      const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
      await client.query('BEGIN');
      const tokenResult = await client.query(
        `SELECT id, user_id FROM password_reset_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
         FOR UPDATE`,
        [tokenHash]
      );
      if (!tokenResult.rows[0]) {
        await client.query('ROLLBACK');
        return ResponseHandler.badRequest(res, 'This password reset link is invalid or expired');
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await client.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [passwordHash, tokenResult.rows[0].user_id]);
      await client.query('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [tokenResult.rows[0].id]);
      await client.query('COMMIT');
      return ResponseHandler.success(res, 'Password reset successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Reset password error:', error);
      return ResponseHandler.serverError(res, 'Unable to reset password');
    } finally {
      client.release();
    }
  }

  /**
   * User Registration
   */
  static async register(req, res) {
    try {
      const { username, email, phone, password, confirmPassword, role, firstName, lastName } = req.body;

      // Validation
      if (!username || !email || !password || !role) {
        return ResponseHandler.badRequest(res, 'Missing required fields: username, email, password, role');
      }

      if (password !== confirmPassword) {
        return ResponseHandler.badRequest(res, 'Passwords do not match');
      }

      if (password.length < 8) {
        return ResponseHandler.badRequest(res, 'Password must be at least 8 characters long');
      }

      if (role !== 'parent' && !isSuperAdmin(req.user)) {
        return ResponseHandler.forbidden(res, 'Public account creation is limited to parents');
      }

      if ((role === 'student' || role === 'parent') && (!firstName || !lastName)) {
        return ResponseHandler.badRequest(res, 'First name and last name are required for student and parent accounts');
      }

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return ResponseHandler.badRequest(res, 'Email already registered');
      }

      const existingUsername = await User.findByUsername(username);
      if (existingUsername) {
        return ResponseHandler.badRequest(res, 'Username already taken');
      }

      // Create user
      const user = await User.create({
        username,
        email,
        phone,
        password,
        role
      });

      const payload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      };

      // Create role-specific records
      if (role === 'student') {
        const student = await Student.create({
          userId: user.id,
          firstName,
          lastName,
          studentId: await Student.generateStudentId(),
          className: null,
          dateOfBirth: null
        });
        await Wallet.create(student.id, 0);
      } else if (role === 'parent') {
        await Parent.create({
          userId: user.id,
          firstName,
          lastName,
          relationship: null
        });
      } else if (role === 'vendor') {
        const vendor = await Vendor.create({
          userId: user.id,
          vendorName: username,
          vendorType: null,
          shopLocation: null,
          contactPerson: null
        });
        if (vendor) payload.vendorId = vendor.id;
      }

      const tokens = JWTUtil.generateTokenPair(payload);

      return ResponseHandler.created(res, 'User registered successfully', {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        tokens
      });
    } catch (error) {
      console.error('Registration error:', error);
      return ResponseHandler.serverError(res, 'Registration failed');
    }
  }

  /**
   * User Login
   */
  static async login(req, res) {
    try {
      const { identifier, password } = req.body;

      if (!identifier || !password) {
        return ResponseHandler.badRequest(res, 'Email/Username and password are required');
      }

      // Find user by email or username
      const emailResult = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [identifier]);
      let user = emailResult.rows[0];
      if (!user) {
        user = await User.findByUsername(identifier);
      }
      if (!user) {
        user = await User.findByPhone(identifier);
      }
      if (!user) {
        const fullNameResult = await query(
          `SELECT u.*
           FROM users u
           JOIN students s ON s.user_id = u.id
           WHERE u.role = 'student'
             AND LOWER(CONCAT(s.first_name, ' ', s.last_name)) = LOWER($1)`,
          [identifier.trim()]
        );
        if (fullNameResult.rows.length === 1) user = fullNameResult.rows[0];
      }
      if (!user && /^\n*\d+\s*$/.test(identifier)) {
        const vendorById = await Vendor.findById(parseInt(identifier, 10));
        if (vendorById) {
          user = await User.findById(vendorById.user_id);
        }
      }

      if (!user) {
        return ResponseHandler.unauthorized(res, 'Invalid credentials');
      }

      // Verify password
      const isPasswordValid = await User.verifyPassword(password, user.password_hash);
      if (!isPasswordValid) {
        return ResponseHandler.unauthorized(res, 'Invalid credentials');
      }

      // Check if user is active
      if (user.status === 'inactive' || user.status === 'deleted') {
        return ResponseHandler.unauthorized(res, 'User account is inactive');
      }

      // Generate tokens
      const payload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      };

      // Get role-specific data
      let userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role
      };

      if (user.role === 'student') {
        const student = await Student.findByUserId(user.id);
        userData.studentId = student?.student_id;
      } else if (user.role === 'parent') {
        const parent = await Parent.findByUserId(user.id);
        userData.parentId = parent?.id;
      } else if (user.role === 'vendor') {
        const vendor = await Vendor.findByUserId(user.id);
        userData.vendorId = vendor?.id;
        if (vendor) payload.vendorId = vendor.id;
      }

      const tokens = JWTUtil.generateTokenPair(payload);

      // Log login action
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, ip_address) 
         VALUES ($1, $2, $3, $4)`,
        [user.id, 'user_login', 'users', req.ip || 'unknown']
      );

      return ResponseHandler.success(res, 'Login successful', {
        user: userData,
        tokens
      });
    } catch (error) {
      console.error('Login error:', error);
      return ResponseHandler.serverError(res, 'Login failed');
    }
  }

  /**
   * Refresh Access Token
   */
  static async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return ResponseHandler.badRequest(res, 'Refresh token is required');
      }

      // Verify refresh token
      const decoded = JWTUtil.verifyRefreshToken(refreshToken);

      // Verify user still exists and is active
      const user = await User.findById(decoded.userId);
      if (!user || user.status === 'deleted') {
        return ResponseHandler.unauthorized(res, 'User no longer exists');
      }

      // Preserve vendor context on token refresh
      const payload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      };
      if (decoded.vendorId) {
        payload.vendorId = decoded.vendorId;
      } else if (user.role === 'vendor') {
        const vendor = await Vendor.findByUserId(user.id);
        if (vendor) payload.vendorId = vendor.id;
      }

      const newTokens = JWTUtil.generateTokenPair(payload);

      return ResponseHandler.success(res, 'Token refreshed', newTokens);
    } catch (error) {
      if (error.message.includes('token')) {
        return ResponseHandler.unauthorized(res, 'Invalid or expired refresh token');
      }
      console.error('Token refresh error:', error);
      return ResponseHandler.serverError(res, 'Token refresh failed');
    }
  }

  /**
   * Logout
   */
  static async logout(req, res) {
    try {
      const userId = req.user?.id;

      if (userId) {
        // Log logout action
        await query(
          `INSERT INTO audit_logs (user_id, action, entity_type, ip_address) 
           VALUES ($1, $2, $3, $4)`,
          [userId, 'user_logout', 'users', req.ip || 'unknown']
        );
      }

      return ResponseHandler.success(res, 'Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      return ResponseHandler.serverError(res, 'Logout failed');
    }
  }

  /**
   * Get Current User Profile
   */
  static async getCurrentUser(req, res) {
    try {
      const userId = req.user?.id;
      const user = await User.findById(userId);

      if (!user) {
        return ResponseHandler.notFound(res, 'User not found');
      }

      let userData = { ...user };

      // Get role-specific data
      if (user.role === 'student') {
        const student = await Student.findByUserId(userId);
        userData.studentData = student;
      } else if (user.role === 'parent') {
        const parent = await Parent.findByUserId(userId);
        userData.parentData = parent;
        const children = await Parent.getChildren(parent.id);
        userData.children = children;
      } else if (user.role === 'vendor') {
        const vendor = await Vendor.findByUserId(userId);
        userData.vendorData = vendor;
      }

      return ResponseHandler.success(res, 'User profile retrieved', userData);
    } catch (error) {
      console.error('Get user error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve user profile');
    }
  }

  /**
   * Change Password
   */
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const userId = req.user?.id;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return ResponseHandler.badRequest(res, 'All password fields are required');
      }

      if (newPassword !== confirmPassword) {
        return ResponseHandler.badRequest(res, 'New passwords do not match');
      }

      if (newPassword.length < 8) {
        return ResponseHandler.badRequest(res, 'New password must be at least 8 characters long');
      }

      // Verify current password
      const user = await User.findById(userId);
      const isPasswordValid = await User.verifyPassword(currentPassword, user.password_hash);

      if (!isPasswordValid) {
        return ResponseHandler.unauthorized(res, 'Current password is incorrect');
      }

      // Update password
      await User.updatePassword(userId, newPassword);

      // Log password change
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, ip_address) 
         VALUES ($1, $2, $3, $4)`,
        [userId, 'password_changed', 'users', req.ip || 'unknown']
      );

      return ResponseHandler.success(res, 'Password changed successfully');
    } catch (error) {
      console.error('Change password error:', error);
      return ResponseHandler.serverError(res, 'Failed to change password');
    }
  }
}

module.exports = AuthController;
