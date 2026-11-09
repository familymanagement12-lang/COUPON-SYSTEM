const PaymentGateway = require('./PaymentGateway');
const crypto = require('crypto');

/**
 * Telecel Cash Payment Gateway
 * Implements Telecel Cash API integration
 */
class TelecelCashGateway extends PaymentGateway {
  constructor(config = {}) {
    super({
      name: 'Telecel Cash',
      apiKey: config.apiKey || process.env.TELECEL_API_KEY,
      baseUrl: config.baseUrl || 'https://api.telecelcash.com',
      ...config
    });

    this.merchantId = config.merchantId || process.env.TELECEL_MERCHANT_ID;
    this.merchantKey = config.merchantKey || process.env.TELECEL_MERCHANT_KEY;
    this.environment = config.environment || 'sandbox';
  }

  /**
   * Generate transaction ID
   */
  generateTransactionId() {
    return `TCL${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }

  /**
   * Initiate payment
   */
  async initiatePayment(paymentData) {
    try {
      this.validatePaymentData(paymentData);
      this.validateAmount(paymentData.amount, 1, 10000);

      const phone = this.formatPhoneNumber(paymentData.phone);
      const transactionId = this.generateTransactionId();

      const payload = {
        transaction_id: transactionId,
        amount: paymentData.amount,
        phone_number: phone,
        merchant_id: this.merchantId,
        description: paymentData.description || 'McCarthy Hill Coupon Top-Up',
        callback_url: paymentData.callbackUrl,
        timestamp: new Date().toISOString()
      };

      // Generate signature
      const signature = this.generateSignature(payload);

      return {
        transactionId,
        payload: {
          ...payload,
          signature
        },
        status: 'pending'
      };
    } catch (error) {
      throw new Error(`Telecel Payment Initiation Error: ${error.message}`);
    }
  }

  /**
   * Generate request signature
   */
  generateSignature(payload) {
    const dataString = `${payload.transaction_id}${payload.amount}${this.merchantKey}`;
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Verify payment status
   */
  async verifyPayment(transactionId) {
    try {
      const response = {
        transaction_id: transactionId,
        status: 'PENDING',
        amount: 0,
        phone_number: '',
        timestamp: new Date(),
        description: 'Telecel Cash Transaction'
      };

      return response;
    } catch (error) {
      throw new Error(`Telecel Verification Error: ${error.message}`);
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(transactionId) {
    try {
      return await this.retryWithBackoff(async () => {
        return await this.verifyPayment(transactionId);
      }, 3, 2000);
    } catch (error) {
      throw new Error(`Failed to get payment status: ${error.message}`);
    }
  }

  /**
   * Process webhook callback
   */
  async processWebhook(webhookData) {
    try {
      if (!this.validateWebhookSignature(webhookData.signature, webhookData.payload)) {
        throw new Error('Invalid webhook signature');
      }

      const { transaction_id, status, amount } = webhookData.payload;

      if (status === 'SUCCESS') {
        return {
          transactionId: transaction_id,
          status: 'completed',
          amount,
          processedAt: new Date()
        };
      } else if (status === 'FAILED') {
        return {
          transactionId: transaction_id,
          status: 'failed',
          reason: webhookData.payload.error_message || 'Payment failed'
        };
      }

      return {
        transactionId: transaction_id,
        status: 'pending'
      };
    } catch (error) {
      throw new Error(`Webhook Processing Error: ${error.message}`);
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(signature, payload) {
    try {
      const dataString = `${payload.transaction_id}${payload.status}${this.merchantKey}`;
      const expectedSignature = crypto
        .createHash('sha256')
        .update(dataString)
        .digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      console.error('Signature validation error:', error);
      return false;
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(transactionId, amount) {
    try {
      const refundId = `REF${transactionId}${Date.now()}`;
      
      return {
        refundId,
        originalTransactionId: transactionId,
        amount,
        status: 'pending',
        requestedAt: new Date()
      };
    } catch (error) {
      throw new Error(`Telecel Refund Error: ${error.message}`);
    }
  }

  /**
   * Check if gateway is configured
   */
  isConfigured() {
    return !!(this.apiKey && this.merchantId && this.merchantKey);
  }

  /**
   * Get gateway info
   */
  getGatewayInfo() {
    return {
      name: this.name,
      provider: 'Telecel',
      environment: this.environment,
      supported_currencies: ['GHS'],
      min_amount: 1,
      max_amount: 10000,
      fee_percentage: 2.5,
      fee_fixed: 0
    };
  }
}

module.exports = TelecelCashGateway;
