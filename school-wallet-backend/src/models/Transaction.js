const { query } = require('../config/database');

class Transaction {
  static async record({ walletId, studentId, parentId, vendorId = null, type, amount, description = null, status = 'completed' }) {
    const sql = `INSERT INTO wallet_transactions (wallet_id, student_id, parent_id, vendor_id, type, amount, description, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW()) RETURNING *`;
    const params = [walletId, studentId, parentId, vendorId, type, amount, description, status];
    const result = await query(sql, params);
    return result.rows[0];
  }

  // Record using existing client (for transactional operations)
  static async recordWithClient(client, { walletId, studentId, parentId, vendorId = null, type, amount, description = null, status = 'completed' }) {
    const sql = `INSERT INTO wallet_transactions (wallet_id, student_id, parent_id, vendor_id, type, amount, description, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW()) RETURNING *`;
    const params = [walletId, studentId, parentId, vendorId, type, amount, description, status];
    const result = await client.query(sql, params);
    return result.rows[0];
  }

  static async getByStudent(studentId, limit = 50, offset = 0) {
    const sql = `SELECT * FROM wallet_transactions WHERE student_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    const result = await query(sql, [studentId, limit, offset]);
    return result.rows;
  }

  static async getLatestByStudents(studentIds, limit = 50) {
    const sql = `SELECT transactions.*
      FROM UNNEST($1::int[]) AS requested(student_id)
      CROSS JOIN LATERAL (
        SELECT *
        FROM wallet_transactions
        WHERE student_id = requested.student_id
        ORDER BY created_at DESC
        LIMIT $2
      ) AS transactions
      ORDER BY transactions.created_at DESC`;
    const result = await query(sql, [studentIds, limit]);
    return result.rows;
  }

  static async getAllWithDetails(limit = 100, offset = 0) {
    const [countResult, transactionsResult] = await Promise.all([
      query('SELECT COUNT(*)::int AS total_count FROM wallet_transactions'),
      query(
        `SELECT wt.id, wt.transaction_id, wt.wallet_id, wt.student_id,
                wt.type, wt.amount, wt.description, wt.status, wt.created_at,
                s.student_id AS student_code, s.first_name, s.last_name,
                v.vendor_name, p.items_description
         FROM wallet_transactions wt
         LEFT JOIN students s ON s.id = wt.student_id
         LEFT JOIN purchases p ON p.transaction_id = wt.id
         LEFT JOIN vendors v ON v.id = p.vendor_id
         ORDER BY wt.created_at DESC, wt.id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      )
    ]);

    return {
      totalCount: countResult.rows[0].total_count,
      transactions: transactionsResult.rows
    };
  }

  static async getByWallet(walletId, limit = 50, offset = 0) {
    const sql = `SELECT * FROM wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    const result = await query(sql, [walletId, limit, offset]);
    return result.rows;
  }

  static async sumForPeriod(walletId, since) {
    const sql = `SELECT COALESCE(SUM(amount),0) as total
      FROM wallet_transactions
      WHERE wallet_id = $1
        AND created_at >= $2
        AND type = 'purchase'
        AND status = 'completed'`;
    const result = await query(sql, [walletId, since]);
    return parseFloat(result.rows[0].total) || 0;
  }
}

module.exports = Transaction;
