const Transaction = require('../models/Transaction');
const ResponseHandler = require('../utils/response');
const Parent = require('../models/Parent');
const { query } = require('../config/database');

class TransactionController {
  static async getHistory(req, res) {
    try {
      const { studentId } = req.query;
      const user = req.user;

      if (!studentId) return ResponseHandler.badRequest(res, 'studentId query param required');

      const parsedStudentId = parseInt(studentId, 10);
      if (!Number.isInteger(parsedStudentId)) return ResponseHandler.badRequest(res, 'studentId must be numeric');

      if (user.role === 'parent') {
        const parent = await Parent.findByUserId(user.id);
        const children = parent ? await Parent.getChildren(parent.id) : [];
        if (!children.some(child => child.id === parsedStudentId)) {
          return ResponseHandler.forbidden(res, 'You can only view linked student transactions');
        }
      } else if (user.role === 'vendor') {
        const vendorPurchase = await query(
          'SELECT 1 FROM purchases WHERE vendor_id = $1 AND student_id = $2 LIMIT 1',
          [user.vendorId, parsedStudentId]
        );
        if (!vendorPurchase.rows.length) {
          return ResponseHandler.forbidden(res, 'You can only view your own sales transactions');
        }
      }

      const txs = await Transaction.getByStudent(studentId);
      return ResponseHandler.success(res, 'Transaction history', { count: txs.length, transactions: txs });
    } catch (error) {
      console.error('Get transaction history error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve transactions');
    }
  }
}

module.exports = TransactionController;
