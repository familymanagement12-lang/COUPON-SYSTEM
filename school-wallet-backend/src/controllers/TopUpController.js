const TopUpService = require('../services/TopUpService');
const ResponseHandler = require('../utils/response');
const Parent = require('../models/Parent');
const Student = require('../models/Student');

class TopUpController {
  /**
   * Get available payment methods
   */
  static async getPaymentMethods(req, res) {
    try {
      const gateways = TopUpService.getAvailableGateways();

      if (gateways.length === 0) {
        return ResponseHandler.error(
          res,
          'No payment gateways configured',
          503
        );
      }

      return ResponseHandler.success(res, 'Available payment methods', {
        count: gateways.length,
        methods: gateways
      });
    } catch (error) {
      console.error('Get payment methods error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve payment methods');
    }
  }

  /**
   * Initiate top-up
   */
  static async initiateTopUp(req, res) {
    try {
      const userId = req.user?.id;
      const { studentId, amount, paymentMethod, description } = req.body;
      const parsedStudentId = parseInt(studentId, 10);

      // Validate inputs
      if (!parsedStudentId || !amount || !paymentMethod) {
        return ResponseHandler.badRequest(res, 'Missing required fields: studentId, amount, paymentMethod');
      }

      if (amount <= 0 || amount > 10000) {
        return ResponseHandler.badRequest(res, 'Amount must be between 1 and 10,000');
      }

      // Verify payment method is valid
      const availableMethods = TopUpService.getAvailableGateways();
      const methodValid = availableMethods.some(m => m.provider.toLowerCase() === paymentMethod.toLowerCase());
      if (!methodValid) {
        return ResponseHandler.badRequest(res, `Payment method '${paymentMethod}' is not available`);
      }

      // Get parent details
      const parent = await Parent.findByUserId(userId);
      if (!parent) {
        return ResponseHandler.notFound(res, 'Parent profile not found');
      }

      // Verify student exists
      const student = await Student.findById(parsedStudentId);
      if (!student) {
        return ResponseHandler.notFound(res, 'Student not found');
      }

      // Verify parent-student relationship
      const children = await Parent.getChildren(parent.id);
      const hasChild = children.some(child => child.id === parsedStudentId);
      if (!hasChild) {
        return ResponseHandler.forbidden(res, 'You do not have permission to fund this student');
      }

      // Initiate top-up
      const topUp = await TopUpService.initiateTopUp(
        parent.id,
        parsedStudentId,
        amount,
        paymentMethod,
        description
      );

      return ResponseHandler.created(res, 'Top-up initiated', topUp);
    } catch (error) {
      console.error('Initiate top-up error:', error);
      if (error.message.includes('not found')) {
        return ResponseHandler.notFound(res, error.message);
      }
      if (error.message.includes('not configured')) {
        return ResponseHandler.error(res, error.message, 503);
      }
      return ResponseHandler.error(res, error.message || 'Failed to initiate top-up', 400);
    }
  }

  /**
   * Complete top-up (called from payment webhook)
   */
  static async completeTopUp(req, res) {
    try {
      const { paymentReference, studentId, amount } = req.body;

      if (!paymentReference || !studentId || !amount) {
        return ResponseHandler.badRequest(res, 'Missing required fields');
      }

      const parent = await Parent.findByUserId(req.user.id);
      if (!parent) return ResponseHandler.notFound(res, 'Parent profile not found');
      const topUp = await TopUpService.verifyAndCompleteTopUp(paymentReference, parent.id);

      return ResponseHandler.success(res, 'Top-up completed successfully', topUp);
    } catch (error) {
      console.error('Complete top-up error:', error);
      if (error.message.includes('not found')) {
        return ResponseHandler.notFound(res, error.message);
      }
      return ResponseHandler.serverError(res, 'Failed to complete top-up');
    }
  }

  static async verifyTopUp(req, res) {
    try {
      const { reference } = req.params;
      const parent = await Parent.findByUserId(req.user.id);
      if (!parent) return ResponseHandler.notFound(res, 'Parent profile not found');
      const topUp = await TopUpService.verifyAndCompleteTopUp(reference, parent.id);
      return ResponseHandler.success(res, 'Top-up verified and completed', topUp);
    } catch (error) {
      console.error('Verify top-up error:', error);
      return ResponseHandler.error(res, error.message || 'Payment has not been completed', 400);
    }
  }

  /**
   * Handle payment webhook callback
   */
  static async handlePaymentWebhook(req, res) {
    try {
      const { provider, status, referenceId, studentId, amount } = req.body;
      const PaystackGateway = require('../services/PaystackGateway');
      const signature = req.headers['x-paystack-signature'];
      const gateway = new PaystackGateway();

      if (!signature || !gateway.validateWebhookSignature(req.rawBody || JSON.stringify(req.body), signature)) {
        return ResponseHandler.unauthorized(res, 'Invalid payment webhook signature');
      }

      const paymentReference = referenceId || req.body.data?.reference;
      const paymentStatus = status || (req.body.event === 'charge.success' ? 'success' : null);

      if (!provider && req.body.event !== 'charge.success') {
        return ResponseHandler.badRequest(res, 'Missing required webhook fields');
      }

      if (!paymentReference || !paymentStatus) {
        return ResponseHandler.badRequest(res, 'Missing required webhook fields');
      }

      if (paymentStatus === 'completed' || paymentStatus === 'success' || paymentStatus === 'successful') {
        const paymentRecord = await require('../config/database').query(
          'SELECT parent_id FROM payment_transactions WHERE provider_reference = $1',
          [paymentReference]
        );
        if (!paymentRecord.rows[0]) return ResponseHandler.notFound(res, 'Payment transaction not found');
        await TopUpService.verifyAndCompleteTopUp(paymentReference, paymentRecord.rows[0].parent_id);
        return ResponseHandler.success(res, 'Webhook processed successfully');
      } else if (status === 'failed') {
        await TopUpService.failTopUp(referenceId, req.body.reason);
        return ResponseHandler.success(res, 'Webhook processed successfully');
      }

      return ResponseHandler.success(res, 'Webhook received');
    } catch (error) {
      console.error('Webhook processing error:', error);
      return ResponseHandler.serverError(res, 'Webhook processing failed');
    }
  }

  /**
   * Get top-up history for parent
   */
  static async getTopUpHistory(req, res) {
    try {
      const userId = req.user?.id;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = parseInt(req.query.offset) || 0;

      // Get parent
      const parent = await Parent.findByUserId(userId);
      if (!parent) {
        return ResponseHandler.notFound(res, 'Parent profile not found');
      }

      const history = await TopUpService.getTopUpHistoryByParent(parent.id, limit, offset);

      return ResponseHandler.success(res, 'Top-up history retrieved', {
        count: history.length,
        limit,
        offset,
        topups: history
      });
    } catch (error) {
      console.error('Get history error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve history');
    }
  }

  /**
   * Get top-up statistics for parent
   */
  static async getTopUpStats(req, res) {
    try {
      const userId = req.user?.id;

      // Get parent
      const parent = await Parent.findByUserId(userId);
      if (!parent) {
        return ResponseHandler.notFound(res, 'Parent profile not found');
      }

      const stats = await TopUpService.getTopUpStatistics(parent.id);

      return ResponseHandler.success(res, 'Top-up statistics retrieved', stats);
    } catch (error) {
      console.error('Get stats error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve statistics');
    }
  }

  /**
   * Get all top-ups (Admin)
   */
  static async getAllTopUps(req, res) {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = parseInt(req.query.offset) || 0;

      const stats = await TopUpService.getTopUpStatistics();

      return ResponseHandler.success(res, 'Top-up statistics retrieved', {
        ...stats,
        limit,
        offset
      });
    } catch (error) {
      console.error('Get all top-ups error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve top-ups');
    }
  }

  /**
   * Cancel pending top-up
   */
  static async cancelTopUp(req, res) {
    try {
      const userId = req.user?.id;
      const { topUpId } = req.params;

      if (!topUpId) {
        return ResponseHandler.badRequest(res, 'Top-up ID is required');
      }

      // TODO: Implement cancellation logic
      // Check if top-up belongs to user
      // Only allow cancellation if status is 'pending'
      // Update status to 'cancelled'

      return ResponseHandler.success(res, 'Top-up cancelled successfully');
    } catch (error) {
      console.error('Cancel top-up error:', error);
      return ResponseHandler.serverError(res, 'Failed to cancel top-up');
    }
  }
}

module.exports = TopUpController;
