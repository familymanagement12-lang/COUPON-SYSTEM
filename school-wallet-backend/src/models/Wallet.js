const { query } = require('../config/database');

class Wallet {
  /**
   * Create wallet for a student
   */
  static async create(studentId, initialBalance = 0.00) {
    const result = await query(
      `INSERT INTO wallets (student_id, balance, status) 
       VALUES ($1, $2, 'active') 
       RETURNING id, student_id, balance, status, created_at, updated_at`,
      [studentId, initialBalance]
    );
    return result.rows[0];
  }

  /**
   * Find wallet by ID
   */
  static async findById(walletId) {
    const result = await query(
      `SELECT w.*, s.student_id, s.first_name, s.last_name, u.email, u.phone
       FROM wallets w
       JOIN students s ON w.student_id = s.id
       JOIN users u ON s.user_id = u.id
       WHERE w.id = $1`,
      [walletId]
    );
    return result.rows[0];
  }

  /**
   * Find wallet by student ID
   */
  static async findByStudentId(studentId) {
    const result = await query(
      `SELECT w.*, s.student_id as student_code, s.first_name, s.last_name, u.email, u.phone
       FROM wallets w
       JOIN students s ON w.student_id = s.id
       JOIN users u ON s.user_id = u.id
       WHERE w.student_id = $1`,
      [studentId]
    );
    return result.rows[0];
  }

  static async findOrCreateByStudentId(studentId) {
    const existingWallet = await this.findByStudentId(studentId);
    if (existingWallet) return existingWallet;

    return await this.create(studentId, 0);
  }

  /**
   * Get wallet balance
   */
  static async getBalance(walletId) {
    const result = await query(
      `SELECT balance, status FROM wallets WHERE id = $1`,
      [walletId]
    );
    return result.rows[0];
  }

  /**
   * Credit wallet (add money)
   */
  static async credit(walletId, amount, description = 'Wallet credit') {
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    const result = await query(
      `UPDATE wallets 
       SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING id, balance, status, updated_at`,
      [amount, walletId]
    );

    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }

    return result.rows[0];
  }

  /**
   * Debit wallet (subtract money)
   */
  static async debit(walletId, amount, description = 'Wallet debit') {
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    const wallet = await this.getBalance(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (wallet.balance < amount) {
      throw new Error('Insufficient balance');
    }

    if (wallet.status === 'frozen') {
      throw new Error('Wallet is frozen');
    }

    if (wallet.status === 'closed') {
      throw new Error('Wallet is closed');
    }

    const result = await query(
      `UPDATE wallets 
       SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING id, balance, status, updated_at`,
      [amount, walletId]
    );

    return result.rows[0];
  }

  // Debit using provided client within a transaction (SELECT ... FOR UPDATE)
  static async debitWithClient(client, walletId, amount) {
    if (amount <= 0) throw new Error('Amount must be greater than 0');

    // Lock wallet row
    const selectSql = `SELECT id, balance, status FROM wallets WHERE id = $1 FOR UPDATE`;
    const sel = await client.query(selectSql, [walletId]);
    if (sel.rows.length === 0) throw new Error('Wallet not found');
    const wallet = sel.rows[0];

    if (wallet.balance < amount) throw new Error('Insufficient balance');
    if (wallet.status === 'frozen') throw new Error('Wallet is frozen');
    if (wallet.status === 'closed') throw new Error('Wallet is closed');

    const updateSql = `UPDATE wallets SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, balance, status, updated_at`;
    const updated = await client.query(updateSql, [amount, walletId]);
    return updated.rows[0];
  }

  /**
   * Freeze wallet
   */
  static async freeze(walletId, reason = null) {
    const result = await query(
      `UPDATE wallets 
       SET status = 'frozen', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING id, balance, status, updated_at`,
      [walletId]
    );

    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }

    // Log audit
    const wallet = await this.findById(walletId);
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) 
       VALUES ($1, $2, $3, $4, $5)`,
      [null, 'wallet_frozen', 'wallets', walletId, JSON.stringify({ reason })]
    );

    return result.rows[0];
  }

  /**
   * Unfreeze wallet
   */
  static async unfreeze(walletId, reason = null) {
    const result = await query(
      `UPDATE wallets 
       SET status = 'active', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING id, balance, status, updated_at`,
      [walletId]
    );

    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }

    // Log audit
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) 
       VALUES ($1, $2, $3, $4, $5)`,
      [null, 'wallet_unfrozen', 'wallets', walletId, JSON.stringify({ reason })]
    );

    return result.rows[0];
  }

  /**
   * Close wallet
   */
  static async close(walletId, reason = null) {
    const result = await query(
      `UPDATE wallets 
       SET status = 'closed', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING id, balance, status, updated_at`,
      [walletId]
    );

    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }

    return result.rows[0];
  }

  /**
   * Get wallet statistics
   */
  static async getStatistics(walletId) {
    const result = await query(
      `SELECT 
        w.id, w.balance, w.status,
        COUNT(CASE WHEN wt.type = 'topup' THEN 1 END) as total_topups,
        COUNT(CASE WHEN wt.type = 'purchase' THEN 1 END) as total_purchases,
        COUNT(CASE WHEN wt.type = 'refund' THEN 1 END) as total_refunds,
        COALESCE(SUM(CASE WHEN wt.type = 'topup' AND wt.status = 'completed' THEN wt.amount ELSE 0 END), 0) as total_topup_amount,
        COALESCE(SUM(CASE WHEN wt.type = 'purchase' AND wt.status = 'completed' THEN wt.amount ELSE 0 END), 0) as total_purchase_amount,
        MAX(wt.created_at) as last_transaction_date
       FROM wallets w
       LEFT JOIN wallet_transactions wt ON w.id = wt.wallet_id
       WHERE w.id = $1
       GROUP BY w.id, w.balance, w.status`,
      [walletId]
    );

    return result.rows[0];
  }

  /**
   * Check if wallet is active
   */
  static async isActive(walletId) {
    const balance = await this.getBalance(walletId);
    return balance && balance.status === 'active';
  }

  /**
   * Get all wallets
   */
  static async getAllWallets(limit = 50, offset = 0) {
    const result = await query(
      `SELECT w.*, s.student_id, s.first_name, s.last_name, u.email
       FROM wallets w
       JOIN students s ON w.student_id = s.id
       JOIN users u ON s.user_id = u.id
       ORDER BY w.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }
}

module.exports = Wallet;
