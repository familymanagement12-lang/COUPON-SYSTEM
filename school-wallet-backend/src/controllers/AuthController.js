const User = require('../models/User');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Vendor = require('../models/Vendor');
const Wallet = require('../models/Wallet');
const JWTUtil = require('../utils/jwt');
const ResponseHandler = require('../utils/response');
const { query } = require('../config/database');
const { getClient } = require('../config/database');
const { isSuperAdmin } = require('../middleware/auth');
const bcrypt = require('bcrypt');

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_BYTES = 72;

const isValidPassword = (password) => typeof password === 'string'
  && password.length >= PASSWORD_MIN_LENGTH
  && Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES;

const isValidEmail = (email) => email.length <= 255
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const normalizeLoginIdentifier = (identifier) => {
  const value = typeof identifier === 'string' ? identifier.trim() : '';
  const mailtoLink = value.match(/^\[([^\]]+)\]\(mailto:([^)]+)\)$/i);
  return mailtoLink ? mailtoLink[2].trim() : value;
};

class AuthController {
  /**
   * User Registration
   */
  static async register(req, res) {
    let client;
    try {
      const body = req.body || {};
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
      const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
      const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
      const { password, confirmPassword } = body;
      const privilegedRegistration = req.user?.status === 'active' && isSuperAdmin(req.user);
      const role = privilegedRegistration ? body.role : 'parent';

      if (!username || !email || !password || !confirmPassword || (privilegedRegistration && !role)) {
        return ResponseHandler.badRequest(res, 'Username, email, password, and password confirmation are required');
      }
      if (username.length < 3 || username.length > 32 || !/^[a-zA-Z0-9._-]+$/.test(username)) {
        return ResponseHandler.badRequest(res, 'Username must be 3-32 characters using letters, numbers, dots, underscores, or hyphens');
      }
      if (!isValidEmail(email)) return ResponseHandler.badRequest(res, 'Enter a valid email address');
      if (phone && (phone.length > 20 || !/^\+?[0-9][0-9\s().-]{4,19}$/.test(phone))) {
        return ResponseHandler.badRequest(res, 'Enter a valid phone number');
      }
      if (password !== confirmPassword) return ResponseHandler.badRequest(res, 'Passwords do not match');
      if (!isValidPassword(password)) {
        return ResponseHandler.badRequest(res, `Password must be at least ${PASSWORD_MIN_LENGTH} characters and no more than ${PASSWORD_MAX_BYTES} UTF-8 bytes`);
      }
      if (privilegedRegistration && !['admin', 'parent', 'student', 'vendor'].includes(role)) {
        return ResponseHandler.badRequest(res, 'Invalid user role');
      }
      if (firstName.length > 255 || lastName.length > 255) {
        return ResponseHandler.badRequest(res, 'Names must be 255 characters or fewer');
      }
      if ((role === 'student' || role === 'parent') && (!firstName || !lastName)) {
        return ResponseHandler.badRequest(res, 'First name and last name are required for student and parent accounts');
      }

      const emailResult = await query('SELECT id FROM users WHERE LOWER(BTRIM(email)) = $1', [email]);
      if (emailResult.rows[0]) return ResponseHandler.error(res, 'Email already registered', 409);

      const existingUsername = await User.findByUsername(username);
      if (existingUsername) return ResponseHandler.error(res, 'Username already taken', 409);

      const userData = { username, email, phone: phone || null, password, role };
      let user;
      let parent;
      if (role === 'parent') {
        client = await getClient();
        await client.query('BEGIN');
        user = await User.create(userData, client);
        parent = await Parent.create({
          userId: user.id,
          firstName,
          lastName,
          relationship: null
        }, client);
        await client.query('COMMIT');
      } else {
        user = await User.create(userData);
      }

      const payload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        tokenVersion: Number(user.token_version || 0)
      };

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
          phone: user.phone,
          role: user.role,
          ...(parent ? { parentId: parent.id } : {})
        },
        tokens
      });
    } catch (error) {
      if (error.code === '23505') {
        if (client) await client.query('ROLLBACK').catch(() => {});
        const constraint = error.constraint || '';
        const message = /email/i.test(constraint)
          ? 'Email already registered'
          : /username/i.test(constraint)
            ? 'Username already taken'
            : 'An account with these details already exists';
        return ResponseHandler.error(res, message, 409);
      }
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Registration error:', error.message);
      return ResponseHandler.serverError(res, 'Registration failed');
    } finally {
      client?.release();
    }
  }

  static async listSuperAdmins(req, res) {
    try {
      const bootstrapEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
      const result = await query(
        `SELECT id, username, email,
                CASE WHEN role = 'super_admin'
                       OR (role = 'admin' AND LOWER(BTRIM(email)) = $1)
                     THEN 'super_admin' ELSE role END AS role,
                status, created_at
         FROM users
         WHERE status <> 'deleted'
           AND (role = 'super_admin' OR (role = 'admin' AND LOWER(BTRIM(email)) = $1))
         ORDER BY created_at, id`,
        [bootstrapEmail]
      );
      return ResponseHandler.success(res, 'Super administrators retrieved', {
        count: result.rows.length,
        maxCount: 5,
        users: result.rows
      });
    } catch (error) {
      console.error('List super administrators error:', error.message);
      return ResponseHandler.serverError(res, 'Unable to list super administrators');
    }
  }

  static async createSuperAdmin(req, res) {
    let client;
    try {
      const body = req.body || {};
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
      const { password, confirmPassword } = body;

      if (!username || !email || !password || !confirmPassword) {
        return ResponseHandler.badRequest(res, 'Username, email, password, and password confirmation are required');
      }
      if (username.length < 3 || username.length > 32 || !/^[a-zA-Z0-9._-]+$/.test(username)) {
        return ResponseHandler.badRequest(res, 'Username must be 3-32 characters using letters, numbers, dots, underscores, or hyphens');
      }
      if (!isValidEmail(email)) return ResponseHandler.badRequest(res, 'Enter a valid email address');
      if (phone && (phone.length > 20 || !/^\+?[0-9][0-9\s().-]{4,19}$/.test(phone))) {
        return ResponseHandler.badRequest(res, 'Enter a valid phone number');
      }
      if (password !== confirmPassword) return ResponseHandler.badRequest(res, 'Passwords do not match');
      if (!isValidPassword(password)) {
        return ResponseHandler.badRequest(res, `Password must be at least ${PASSWORD_MIN_LENGTH} characters and no more than ${PASSWORD_MAX_BYTES} UTF-8 bytes`);
      }

      client = await getClient();
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [73402912]);

      const bootstrapEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM users
         WHERE status <> 'deleted'
           AND (role = 'super_admin' OR (role = 'admin' AND LOWER(BTRIM(email)) = $1))`,
        [bootstrapEmail]
      );
      if (countResult.rows[0].count >= 5) {
        await client.query('ROLLBACK');
        return ResponseHandler.error(res, 'The system is limited to five super administrators', 409);
      }

      const user = await User.create({
        username,
        email,
        phone: phone || null,
        password,
        role: 'super_admin'
      }, client);
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value, ip_address)
         VALUES ($1, 'super_admin_created', 'users', $2, $3, $4)`,
        [req.user.id, user.id, JSON.stringify({ email: user.email }), req.ip || 'unknown']
      );
      await client.query('COMMIT');

      return ResponseHandler.created(res, 'Super administrator created', {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          created_at: user.created_at
        }
      });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') {
        const constraint = error.constraint || '';
        const message = /email/i.test(constraint)
          ? 'Email already registered'
          : /username/i.test(constraint)
            ? 'Username already taken'
            : 'An account with these details already exists';
        return ResponseHandler.error(res, message, 409);
      }
      console.error('Create super administrator error:', error.message);
      return ResponseHandler.serverError(res, 'Unable to create super administrator');
    } finally {
      client?.release();
    }
  }

  static async promoteSuperAdmin(req, res) {
    let client;
    try {
      const email = typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
      if (!isValidEmail(email)) return ResponseHandler.badRequest(res, 'Enter a valid email address');

      client = await getClient();
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [73402912]);

      const accountResult = await client.query(
        `SELECT id, username, email, role, status, created_at
         FROM users
         WHERE LOWER(BTRIM(email)) = $1
         FOR UPDATE`,
        [email]
      );
      const account = accountResult.rows[0];
      if (!account) {
        await client.query('ROLLBACK');
        return ResponseHandler.notFound(res, 'No existing account was found for this email');
      }

      const bootstrapEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
      if (account.role === 'super_admin'
          || (account.role === 'admin' && account.email.trim().toLowerCase() === bootstrapEmail)) {
        await client.query('ROLLBACK');
        return ResponseHandler.error(res, 'This account is already a super administrator', 409);
      }
      if (account.role !== 'admin' || account.status !== 'active') {
        await client.query('ROLLBACK');
        return ResponseHandler.error(res, 'Only active admin accounts can be promoted', 409);
      }

      const countResult = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM users
         WHERE status <> 'deleted'
           AND (role = 'super_admin' OR (role = 'admin' AND LOWER(BTRIM(email)) = $1))`,
        [bootstrapEmail]
      );
      if (countResult.rows[0].count >= 5) {
        await client.query('ROLLBACK');
        return ResponseHandler.error(res, 'The system is limited to five super administrators', 409);
      }

      const updateResult = await client.query(
        `UPDATE users
         SET role = 'super_admin', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, username, email, role, status, created_at`,
        [account.id]
      );
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value, ip_address)
         VALUES ($1, 'super_admin_promoted', 'users', $2, $3, $4)`,
        [req.user.id, account.id, JSON.stringify({ email: account.email }), req.ip || 'unknown']
      );
      await client.query('COMMIT');

      return ResponseHandler.updated(res, 'Existing administrator promoted to super administrator', {
        user: updateResult.rows[0]
      });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Promote super administrator error:', error.message);
      return ResponseHandler.serverError(res, 'Unable to promote administrator');
    } finally {
      client?.release();
    }
  }

  /**
   * User Login
   */
  static async login(req, res) {
    try {
      const { password } = req.body || {};
      const identifier = normalizeLoginIdentifier(req.body?.identifier);

      if (!identifier || !password) {
        return ResponseHandler.badRequest(res, 'Email/Username and password are required');
      }

      // Find user by email or username
      const emailResult = await query(
        'SELECT * FROM users WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))',
        [identifier]
      );
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
      if (Number(decoded.tokenVersion || 0) !== Number(user.token_version || 0)) {
        return ResponseHandler.unauthorized(res, 'Invalid or expired refresh token');
      }

      // Preserve vendor context on token refresh
      const payload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        tokenVersion: Number(user.token_version || 0)
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

      if (!isValidPassword(newPassword)) {
        return ResponseHandler.badRequest(res, `Password must be at least ${PASSWORD_MIN_LENGTH} characters and no more than ${PASSWORD_MAX_BYTES} UTF-8 bytes`);
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
