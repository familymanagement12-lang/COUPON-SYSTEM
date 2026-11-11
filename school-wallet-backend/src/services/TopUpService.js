const { query, getClient } = require('../config/database');
const Wallet = require('../models/Wallet');
const PaystackGateway = require('./PaystackGateway');

/**
 * Top-Up Service
 * Handles wallet funding operations and payment processing
 */
class TopUpService {
  static getPaymentCallbackUrl() {
    const frontendBase = String(process.env.FRONTEND_URL || 'http://localhost:5173')
      .split(',')[0]
      .trim()
      .replace(/\/+$/, '');
    const fallbackUrl = `${frontendBase}/topup`;
    const configuredUrl = process.env.PAYMENT_RETURN_URL;
    if (!configuredUrl) return fallbackUrl;

    try {
      const callback = new URL(configuredUrl);
      const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(callback.hostname);
      if (process.env.NODE_ENV === 'production' && (callback.protocol !== 'https:' || isLocalHost)) {
        return fallbackUrl;
      }
      return callback.toString();
    } catch {
      return fallbackUrl;
    }
  }

  /**
   * Get available payment gateways
   */
  static getAvailableGateways() {
    const gateways = [];

    try {
      const paystackGateway = new PaystackGateway();
      if (paystackGateway.isConfigured()) {
        gateways.push(paystackGateway.getGatewayInfo());
      }
    } catch (error) {
      console.warn('Paystack gateway not configured:', error.message);
    }

    return gateways;
  }

  /**
   * Get payment gateway by provider name
   */
  static getGateway(provider) {
    const providers = {
      'paystack': () => new PaystackGateway()
    };

    if (!providers[provider.toLowerCase()]) {
      throw new Error(`Payment provider '${provider}' not supported`);
    }

    const gateway = providers[provider.toLowerCase()]();

    if (!gateway.isConfigured()) {
      throw new Error(`Payment provider '${provider}' is not configured`);
    }

    return gateway;
  }

  /**
   * Initiate top-up transaction
   */
  static async initiateTopUp(parentId, studentId, amount, paymentMethod, description = null) {
    try {
      // Validate inputs
      if (!parentId || !studentId || !amount || !paymentMethod) {
        throw new Error('Missing required parameters');
      }

      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // Get or create student wallet
      const wallet = await Wallet.findOrCreateByStudentId(studentId);

      if (wallet.status !== 'active') {
        throw new Error('Wallet is not active');
      }

      // Get parent user phone from database
      const parentResult = await query(
        `SELECT u.email, u.phone, p.first_name, p.last_name FROM parents p 
         JOIN users u ON p.user_id = u.id 
         WHERE p.id = $1`,
        [parentId]
      );

      if (parentResult.rows.length === 0) {
        throw new Error('Parent not found');
      }

      const parentData = parentResult.rows[0];

      // Create transaction record
      const transactionReference = `TXN${Date.now()}`;
      const walletTxnResult = await query(
        `INSERT INTO wallet_transactions
         (transaction_id, wallet_id, student_id, amount, type, description, status, reference_id)
         VALUES ($1, $2, $3, $4, 'topup', $5, 'pending', $6)
         RETURNING id`,
        [
          transactionReference,
          wallet.id,
          studentId,
          amount,
          description || `McCarthy Hill Coupon Top-Up for ${wallet.student_id}`,
          transactionReference
        ]
      );

      const txnResult = await query(
        `INSERT INTO payment_transactions (wallet_transaction_id, parent_id, payment_method, amount, provider_reference, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING id`,
        [walletTxnResult.rows[0].id, parentId, paymentMethod, amount, transactionReference]
      );

      const paymentTxnId = txnResult.rows[0].id;

      // Get payment gateway
      const gateway = this.getGateway(paymentMethod);

      // Prepare payment data
      const paymentData = {
        phone: parentData.phone,
        email: parentData.email,
        name: `${parentData.first_name || ''} ${parentData.last_name || ''}`.trim(),
        amount,
        studentId,
        description: description || `McCarthy Hill Coupon Top-Up for ${wallet.student_id}`,
        transactionReference,
        callbackUrl: this.getPaymentCallbackUrl()
      };

      // Initiate payment with gateway
      const paymentResponse = await gateway.initiatePayment(paymentData);

      // Update transaction with gateway reference
      if (!paymentResponse.success) {
        await query(`UPDATE payment_transactions SET status = 'failed' WHERE id = $1`, [paymentTxnId]);
        await query(`UPDATE wallet_transactions SET status = 'failed' WHERE id = $1`, [walletTxnResult.rows[0].id]);
        throw new Error(paymentResponse.error || 'Paystack payment initialization failed');
      }

      await query(
        `UPDATE payment_transactions SET provider_reference = $1 WHERE id = $2`,
        [paymentResponse.reference || transactionReference, paymentTxnId]
      );
      await query(
        `UPDATE wallet_transactions SET reference_id = $1 WHERE id = $2`,
        [paymentResponse.reference || transactionReference, walletTxnResult.rows[0].id]
      );

      return {
        transactionId: paymentTxnId,
        paymentReference: paymentResponse.reference || transactionReference,
        provider: paymentMethod,
        amount,
        status: 'pending',
        paymentUrl: paymentResponse.paymentUrl,
        accessCode: paymentResponse.accessCode
      };
    } catch (error) {
      console.error('Top-up initiation error:', error);
      throw error;
    }
  }

  /**
   * Complete top-up transaction
   */
  static async completeTopUp(paymentReference, studentId, amount) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const txnResult = await client.query(
        `SELECT pt.*, p.user_id AS parent_user_id,
          wt.wallet_id, wt.student_id, wt.status AS wallet_transaction_status
         FROM payment_transactions pt
         JOIN wallet_transactions wt ON wt.id = pt.wallet_transaction_id
         JOIN parents p ON p.id = pt.parent_id
         WHERE pt.provider_reference = $1
         FOR UPDATE OF pt, wt`,
        [paymentReference]
      );

      if (txnResult.rows.length === 0) {
        throw new Error('Payment transaction not found');
      }

      const paymentTxn = txnResult.rows[0];

      if (paymentTxn.status === 'completed' && paymentTxn.wallet_transaction_status === 'completed') {
        const walletResult = await client.query(
          `SELECT id, balance FROM wallets WHERE id = $1`,
          [paymentTxn.wallet_id]
        );
        const wallet = walletResult.rows[0];
        await client.query('COMMIT');
        return {
          walletId: paymentTxn.wallet_id,
          studentId: paymentTxn.student_id,
          amount: paymentTxn.amount,
          newBalance: wallet.balance,
          transactionId: paymentReference,
          status: 'completed',
          timestamp: new Date()
        };
      }

      const walletResult = await client.query(
        `SELECT id, balance, status
         FROM wallets
         WHERE id = $1
         FOR UPDATE`,
        [paymentTxn.wallet_id]
      );
      const wallet = walletResult.rows[0];
      if (!wallet) {
        throw new Error('Student wallet not found');
      }
      if (wallet.status !== 'active') {
        throw new Error('Wallet is not active');
      }

      const updatedWalletResult = await client.query(
        `UPDATE wallets
         SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, balance, status, updated_at`,
        [paymentTxn.amount, wallet.id]
      );
      const updatedWallet = updatedWalletResult.rows[0];

      await client.query(
        `UPDATE wallet_transactions
         SET status = 'completed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [paymentTxn.wallet_transaction_id]
      );

      await client.query(
        `UPDATE payment_transactions
         SET status = 'completed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [paymentTxn.id]
      );

      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) 
         VALUES ($1, $2, $3, $4, $5)`,
        [paymentTxn.parent_user_id, 'topup_completed', 'wallets', wallet.id, JSON.stringify({ amount: paymentTxn.amount, balance: updatedWallet.balance })]
      );

      await client.query('COMMIT');

      return {
        walletId: wallet.id,
        studentId: paymentTxn.student_id,
        amount: paymentTxn.amount,
        newBalance: updatedWallet.balance,
        transactionId: paymentReference,
        status: 'completed',
        timestamp: new Date()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Top-up completion error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async verifyAndCompleteTopUp(paymentReference, parentId) {
    const transactionResult = await query(
      `SELECT pt.provider_reference, pt.parent_id
       FROM payment_transactions pt
       WHERE pt.provider_reference = $1`,
      [paymentReference]
    );
    const paymentTransaction = transactionResult.rows[0];
    if (!paymentTransaction) throw new Error('Payment transaction not found');
    if (paymentTransaction.parent_id !== parentId) throw new Error('Payment does not belong to this parent');

    const gateway = this.getGateway('paystack');
    const verification = await gateway.verifyPayment(paymentReference);
    if (!verification.success) {
      if (verification.status === 'failed') {
        await this.failTopUp(paymentReference, verification.error || 'Paystack payment failed');
      }
      throw new Error(verification.error || verification.message || 'Payment has not been completed');
    }

    return this.completeTopUp(paymentReference);
  }

  /**
   * Fail top-up transaction
   */
  static async failTopUp(paymentReference, reason = null) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const txnResult = await client.query(
        `SELECT pt.id, pt.wallet_transaction_id, pt.status,
                wt.status AS wallet_transaction_status
         FROM payment_transactions pt
         JOIN wallet_transactions wt ON wt.id = pt.wallet_transaction_id
         WHERE pt.provider_reference = $1
         FOR UPDATE OF pt, wt`,
        [paymentReference]
      );

      const paymentTxn = txnResult.rows[0];
      if (!paymentTxn) {
        throw new Error('Payment transaction not found');
      }
      if (paymentTxn.status === 'completed' || paymentTxn.wallet_transaction_status === 'completed') {
        await client.query('COMMIT');
        return { transactionId: paymentTxn.id, status: 'completed' };
      }

      await client.query(
        `UPDATE payment_transactions
         SET status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending'`,
        [paymentTxn.id]
      );
      await client.query(
        `UPDATE wallet_transactions
         SET status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending'`,
        [paymentTxn.wallet_transaction_id]
      );
      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, new_value)
         VALUES ($1, $2, $3, $4)`,
        ['topup_failed', 'payment_transactions', paymentTxn.id, JSON.stringify({ reason })]
      );
      await client.query('COMMIT');

      return {
        transactionId: paymentTxn.id,
        status: 'failed',
        reason: reason || 'Payment failed'
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Top-up failure error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get top-up history for parent
   */
  static async getTopUpHistoryByParent(parentId, limit = 50, offset = 0) {
    try {
      const result = await query(
        `SELECT pt.*, wt.transaction_id as wallet_transaction_id, s.student_id, s.first_name, s.last_name
         FROM payment_transactions pt
         LEFT JOIN wallet_transactions wt ON pt.wallet_transaction_id = wt.id
         LEFT JOIN wallets w ON wt.wallet_id = w.id
         LEFT JOIN students s ON w.student_id = s.id
         WHERE pt.parent_id = $1
         ORDER BY pt.created_at DESC
         LIMIT $2 OFFSET $3`,
        [parentId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      console.error('History fetch error:', error);
      throw error;
    }
  }

  /**
   * Get top-up history for student wallet
   */
  static async getTopUpHistoryByStudent(studentId, limit = 50, offset = 0) {
    try {
      const result = await query(
        `SELECT wt.*, p.first_name, p.last_name, pt.payment_method
         FROM wallet_transactions wt
         JOIN wallets w ON wt.wallet_id = w.id
         LEFT JOIN payment_transactions pt ON wt.reference_id = pt.provider_reference
         LEFT JOIN parents p ON pt.parent_id = p.id
         WHERE w.student_id = $1 AND wt.type = 'topup'
         ORDER BY wt.created_at DESC
         LIMIT $2 OFFSET $3`,
        [studentId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      console.error('History fetch error:', error);
      throw error;
    }
  }

  /**
   * Get top-up statistics
   */
  static async getTopUpStatistics(parentId = null) {
    try {
      let query_str = `SELECT 
        COUNT(*) as total_topups,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_topups,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_topups,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_topups,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_amount,
        AVG(amount) as average_amount
       FROM payment_transactions`;

      if (parentId) {
        query_str += ` WHERE parent_id = $1`;
      }

      const result = await query(query_str, parentId ? [parentId] : []);
      return result.rows[0];
    } catch (error) {
      console.error('Statistics fetch error:', error);
      throw error;
    }
  }
}

module.exports = TopUpService;
