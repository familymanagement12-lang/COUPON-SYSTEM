const { query } = require('../config/database');
const ResponseHandler = require('../utils/response');

class ReportingController {
  static async financialSummary(req, res) {
    try {
      const depositsSql = `SELECT COALESCE(SUM(amount),0) as total_deposits FROM wallet_transactions WHERE type = 'topup' AND status = 'completed'`;
      const purchasesSql = `SELECT COALESCE(SUM(amount),0) as total_purchases FROM wallet_transactions WHERE type = 'purchase' AND status = 'completed'`;
      const refundsSql = `SELECT COALESCE(SUM(amount),0) as total_refunds FROM wallet_transactions WHERE type = 'refund' AND status = 'completed'`;

      const deposits = await query(depositsSql);
      const purchases = await query(purchasesSql);
      const refunds = await query(refundsSql);

      const summary = {
        total_deposits: parseFloat(deposits.rows[0].total_deposits) || 0,
        total_purchases: parseFloat(purchases.rows[0].total_purchases) || 0,
        total_refunds: parseFloat(refunds.rows[0].total_refunds) || 0,
      };

      return ResponseHandler.success(res, 'Financial summary', { summary });
    } catch (error) {
      console.error('Reporting error:', error);
      return ResponseHandler.serverError(res, 'Failed to generate report');
    }
  }
}

module.exports = ReportingController;
