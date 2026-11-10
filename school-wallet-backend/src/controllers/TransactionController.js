const Transaction = require('../models/Transaction');
const ResponseHandler = require('../utils/response');
const Parent = require('../models/Parent');
const { query } = require('../config/database');
const parseStudentIds = require('../utils/parseStudentIds');

class TransactionController {
  static async getAllHistory(req, res) {
    try {
      const limitValue = req.query.limit === undefined ? 100 : Number(req.query.limit);
      const offsetValue = req.query.offset === undefined ? 0 : Number(req.query.offset);
      if (!Number.isSafeInteger(limitValue) || limitValue < 1 || limitValue > 100
        || !Number.isSafeInteger(offsetValue) || offsetValue < 0) {
        return ResponseHandler.badRequest(res, 'limit must be 1-100 and offset must be a non-negative integer');
      }

      const { totalCount, transactions } = await Transaction.getAllWithDetails(limitValue, offsetValue);
      return ResponseHandler.success(res, 'All transaction history', {
        count: transactions.length,
        totalCount,
        limit: limitValue,
        offset: offsetValue,
        transactions
      });
    } catch (error) {
      console.error('Get all transaction history error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve all transactions');
    }
  }

  static async getHistory(req, res) {
    try {
      const user = req.user;
      const requestedIds = req.query.studentIds ?? req.query.studentId;
      if (requestedIds === undefined) {
        return ResponseHandler.badRequest(res, 'studentId or studentIds query param required');
      }
      const studentIds = parseStudentIds(requestedIds);
      if (!studentIds) {
        return ResponseHandler.badRequest(res, 'Provide between 1 and 100 valid student IDs');
      }

      if (user.role === 'parent') {
        const parent = await Parent.findByUserId(user.id);
        const children = parent ? await Parent.getChildren(parent.id) : [];
        const linkedIds = new Set(children.map(child => Number(child.id)));
        if (studentIds.some(id => !linkedIds.has(id))) {
          return ResponseHandler.forbidden(res, 'You can only view linked student transactions');
        }
      } else if (user.role === 'vendor') {
        const vendorPurchase = await query(
          'SELECT DISTINCT student_id FROM purchases WHERE vendor_id = $1 AND student_id = ANY($2::int[])',
          [user.vendorId, studentIds]
        );
        const authorizedIds = new Set(vendorPurchase.rows.map(row => Number(row.student_id)));
        if (studentIds.some(id => !authorizedIds.has(id))) {
          return ResponseHandler.forbidden(res, 'You can only view your own sales transactions');
        }
      }

      const txs = studentIds.length === 1
        ? await Transaction.getByStudent(studentIds[0])
        : await Transaction.getLatestByStudents(studentIds);
      return ResponseHandler.success(res, 'Transaction history', { count: txs.length, transactions: txs });
    } catch (error) {
      console.error('Get transaction history error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve transactions');
    }
  }
}

module.exports = TransactionController;
