const { query } = require('../config/database');

class SpendingLimit {
  static async getByStudent(studentId) {
    const sql = `SELECT * FROM spending_limits WHERE student_id = $1 LIMIT 1`;
    const result = await query(sql, [studentId]);
    return result.rows[0];
  }

  static async getByStudents(studentIds) {
    const result = await query(
      'SELECT * FROM spending_limits WHERE student_id = ANY($1::int[])',
      [studentIds]
    );
    return result.rows;
  }

  static async setForStudent(studentId, { daily_limit = null, weekly_limit = null }) {
    const sql = `INSERT INTO spending_limits (student_id, daily_limit, weekly_limit, created_at)
      VALUES ($1,$2,$3,NOW())
      ON CONFLICT (student_id) DO UPDATE SET daily_limit = EXCLUDED.daily_limit, weekly_limit = EXCLUDED.weekly_limit, updated_at = NOW()
      RETURNING *`;
    const params = [studentId, daily_limit, weekly_limit];
    const result = await query(sql, params);
    return result.rows[0];
  }
}

module.exports = SpendingLimit;
