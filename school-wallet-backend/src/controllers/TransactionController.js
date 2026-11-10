const Transaction = require('../models/Transaction');
const ResponseHandler = require('../utils/response');
const Parent = require('../models/Parent');
const { query } = require('../config/database');
const parseStudentIds = require('../utils/parseStudentIds');

class TransactionController {
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
