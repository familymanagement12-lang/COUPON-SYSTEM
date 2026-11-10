const Wallet = require('../models/Wallet');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const ResponseHandler = require('../utils/response');
const TopUpService = require('../services/TopUpService');

class WalletController {
  /**
   * Get wallet by ID (Admin)
   */
  static async getWalletById(req, res) {
    try {
      const { walletId } = req.params;

      const wallet = await Wallet.findById(walletId);
      if (!wallet) {
        return ResponseHandler.notFound(res, 'Wallet not found');
      }

      return ResponseHandler.success(res, 'Wallet retrieved', wallet);
    } catch (error) {
      console.error('Get wallet error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve wallet');
    }
  }

  /**
   * Get wallet for current user (Student/Parent)
   */
  static async getMyWallet(req, res) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (userRole === 'admin' || userRole === 'super_admin') {
        return WalletController.getAllWallets(req, res);
      }

      if (userRole === 'student') {
        const student = await Student.findByUserId(userId);
        if (!student) {
          return ResponseHandler.notFound(res, 'Student profile not found');
        }

        const wallet = await Wallet.findOrCreateByStudentId(student.id);

        return ResponseHandler.success(res, 'Wallet retrieved', wallet);
      } else if (userRole === 'parent') {
        const parent = await Parent.findOrCreateByUser(req.user);
        if (!parent) {
          return ResponseHandler.notFound(res, 'Parent profile not found');
        }

        const children = await Parent.getChildren(parent.id);
        const wallets = await Promise.all(children.map(async child => {
          const wallet = await Wallet.findOrCreateByStudentId(child.id);
          return {
            ...wallet,
            student_internal_id: child.id,
            student_code: child.student_id,
            first_name: child.first_name,
            last_name: child.last_name
          };
        }));

        return ResponseHandler.success(res, 'Student wallets retrieved', wallets);
      }

      return ResponseHandler.forbidden(res, 'User role cannot access wallets');
    } catch (error) {
      console.error('Get my wallet error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve wallet');
    }
  }

  /**
   * Get wallet balance
   */
  static async getWalletBalance(req, res) {
    try {
      const { walletId } = req.params;

      const balance = await Wallet.getBalance(walletId);
      if (!balance) {
        return ResponseHandler.notFound(res, 'Wallet not found');
      }

      return ResponseHandler.success(res, 'Wallet balance retrieved', {
        walletId,
        balance: balance.balance,
        status: balance.status,
        currency: 'GHS'
      });
    } catch (error) {
      console.error('Get balance error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve balance');
    }
  }

  /**
   * Freeze wallet (Admin/Parent)
   */
  static async freezeWallet(req, res) {
    try {
      const { walletId } = req.params;
      const { reason } = req.body;

      const wallet = await Wallet.findById(walletId);
      if (!wallet) {
        return ResponseHandler.notFound(res, 'Wallet not found');
      }

      const updated = await Wallet.freeze(walletId, reason);

      return ResponseHandler.success(res, 'Wallet frozen successfully', updated);
    } catch (error) {
      console.error('Freeze wallet error:', error);
      if (error.message.includes('not found')) {
        return ResponseHandler.notFound(res, error.message);
      }
      return ResponseHandler.serverError(res, 'Failed to freeze wallet');
    }
  }

  /**
   * Unfreeze wallet (Admin)
   */
  static async unfreezeWallet(req, res) {
    try {
      const { walletId } = req.params;
      const { reason } = req.body;

      const wallet = await Wallet.findById(walletId);
      if (!wallet) {
        return ResponseHandler.notFound(res, 'Wallet not found');
      }

      const updated = await Wallet.unfreeze(walletId, reason);

      return ResponseHandler.success(res, 'Wallet unfrozen successfully', updated);
    } catch (error) {
      console.error('Unfreeze wallet error:', error);
      if (error.message.includes('not found')) {
        return ResponseHandler.notFound(res, error.message);
      }
      return ResponseHandler.serverError(res, 'Failed to unfreeze wallet');
    }
  }

  /**
   * Get wallet statistics
   */
  static async getWalletStatistics(req, res) {
    try {
      const { walletId } = req.params;

      const wallet = await Wallet.findById(walletId);
      if (!wallet) {
        return ResponseHandler.notFound(res, 'Wallet not found');
      }

      const stats = await Wallet.getStatistics(walletId);

      return ResponseHandler.success(res, 'Wallet statistics retrieved', stats);
    } catch (error) {
      console.error('Get statistics error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve statistics');
    }
  }

  /**
   * Create wallet for student (Admin)
   */
  static async createWallet(req, res) {
    try {
      const { studentId, initialBalance } = req.body;

      if (!studentId) {
        return ResponseHandler.badRequest(res, 'Student ID is required');
      }

      // Check if student exists
      const student = await Student.findById(studentId);
      if (!student) {
        return ResponseHandler.notFound(res, 'Student not found');
      }

      // Check if wallet already exists
      const existingWallet = await Wallet.findByStudentId(studentId);
      if (existingWallet) {
        return ResponseHandler.badRequest(res, 'Wallet already exists for this student');
      }

      const wallet = await Wallet.create(studentId, initialBalance || 0);

      return ResponseHandler.created(res, 'Wallet created successfully', wallet);
    } catch (error) {
      console.error('Create wallet error:', error);
      return ResponseHandler.serverError(res, 'Failed to create wallet');
    }
  }

  /**
   * Get all wallets (Admin)
   */
  static async getAllWallets(req, res) {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = parseInt(req.query.offset) || 0;

      const wallets = await Wallet.getAllWallets(limit, offset);

      return ResponseHandler.success(res, 'Wallets retrieved', {
        count: wallets.length,
        limit,
        offset,
        wallets
      });
    } catch (error) {
      console.error('Get all wallets error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve wallets');
    }
  }
}

module.exports = WalletController;
