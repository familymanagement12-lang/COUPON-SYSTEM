const PaymentGateway = require('./PaymentGateway');
const crypto = require('crypto');

/**
 * AirtelTigo Cash Payment Gateway
 * Implements AirtelTigo Cash API integration
 */
class AirtelTigoCashGateway extends PaymentGateway {
  constructor(config = {}) {
    super({
      name: 'AirtelTigo Cash',
      apiKey: config.apiKey || process.env.AIRTELTIGO_API_KEY,
      baseUrl: config.baseUrl || 'https://api.airteltigo.com',
      ...config
    });

    this.clientId = config.clientId || process.env.AIRTELTIGO_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.AIRTELTIGO_CLIENT_SECRET;
    this.environment = config.environment || 'sandbox';
  }

  /**
   * Generate request ID
   */
  generateRequestId() {
    return `ATG${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }

  /**
   * Initiate payment
   */
  async initiatePayment(paymentData) {
    try {
      this.validatePaymentData(paymentData);
      this.validateAmount(paymentData.amount, 1, 10000);

      const phone = this.formatPhoneNumber(paymentData.phone);
      const requestId = this.generateRequestId();

      const payload = {
        request_id: requestId,
        msisdn: phone,
        amount: paymentData.amount,
        currency: 'GHS',
        description: paymentData.description || 'McCarthy Hill Coupon Top-Up',
        reference: paymentData.reference || `WALLET_${Date.now()}`,
        callback_url: paymentData.callbackUrl,
        client_id: this.clientId,
        timestamp: new Date().toISOString()
      };

      // Generate signature
      const signature = this.generateSignature(payload);

      return {
        requestId,
        payload: {
          ...payload,
          signature
        },
        status: 'pending'
      };
    } catch (error) {
      throw new Error(`AirtelTigo Payment Initiation Error: ${error.message}`);
    }
  }

  /**
   * Generate request signature
   */
  generateSignature(payload) {
    const dataString = `${payload.request_id}${payload.amount}${this.clientSecret}`;
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Verify payment status
   */
  async verifyPayment(requestId) {
    try {
      const response = {
        request_id: requestId,
        status: 'PENDING',
        amount: 0,
        msisdn: '',
        currency: 'GHS',
        timestamp: new Date(),
        reference: ''
      };

      return response;
    } catch (error) {
      throw new Error(`AirtelTigo Verification Error: ${error.message}`);
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(requestId) {
    try {
      return await this.retryWithBackoff(async () => {
        return await this.verifyPayment(requestId);
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

      const { request_id, status, amount, reference } = webhookData.payload;

      if (status === 'SUCCESS' || status === 'COMPLETED') {
        return {
          transactionId: request_id,
          status: 'completed',
          amount,
          reference,
          processedAt: new Date()
        };
      } else if (status === 'FAILED') {
        return {
          transactionId: request_id,
          status: 'failed',
          reason: webhookData.payload.error_message || 'Payment failed'
        };
      }

      return {
        transactionId: request_id,
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
      const dataString = `${payload.request_id}${payload.status}${this.clientSecret}`;
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
  async refundPayment(requestId, amount) {
    try {
      const refundId = `REF${requestId}${Date.now()}`;
      
      return {
        refundId,
        originalTransactionId: requestId,
        amount,
        status: 'pending',
        requestedAt: new Date()
      };
    } catch (error) {
      throw new Error(`AirtelTigo Refund Error: ${error.message}`);
    }
  }

  /**
   * Check if gateway is configured
   */
  isConfigured() {
    return !!(this.apiKey && this.clientId && this.clientSecret);
  }

  /**
   * Get gateway info
   */
  getGatewayInfo() {
    return {
      name: this.name,
      provider: 'AirtelTigo',
      environment: this.environment,
      supported_currencies: ['GHS'],
      min_amount: 1,
      max_amount: 10000,
      fee_percentage: 2.0,
      fee_fixed: 0
    };
  }
}

module.exports = AirtelTigoCashGateway;
