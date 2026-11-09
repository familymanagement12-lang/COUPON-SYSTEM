const PaymentGateway = require('./PaymentGateway');
const crypto = require('crypto');
const https = require('https');

/**
 * MTN Mobile Money Payment Gateway
 * Implements MTN MoMo API integration
 */
class MTNMobileMoneyGateway extends PaymentGateway {
  constructor(config = {}) {
    super({
      name: 'MTN Mobile Money',
      apiKey: config.apiKey || process.env.MTN_API_KEY,
      baseUrl: config.baseUrl || 'https://api.mtn.com',
      ...config
    });

    this.primaryKey = config.primaryKey || process.env.MTN_PRIMARY_KEY;
    this.secondaryKey = config.secondaryKey || process.env.MTN_SECONDARY_KEY;
    this.subscriptionKey = config.subscriptionKey || process.env.MTN_SUBSCRIPTION_KEY;
    this.userIdHeader = config.userIdHeader || process.env.MTN_USER_ID;
    this.targetEnvironment = config.targetEnvironment || 'sandbox'; // 'production' or 'sandbox'
  }

  /**
   * Generate UUID v4
   */
  generateUUID() {
    return crypto.randomUUID();
  }

  /**
   * Get request to pay details
   */
  async initiatePayment(paymentData) {
    try {
      this.validatePaymentData(paymentData);
      this.validateAmount(paymentData.amount, 1, 10000);

      const phone = this.formatPhoneNumber(paymentData.phone);
      const referenceId = this.generateUUID();
      const externalId = paymentData.externalId || `WALLET_${Date.now()}`;

      const payload = {
        amount: paymentData.amount.toString(),
        currency: 'GHS',
        externalId: externalId,
        payer: {
          partyIdType: 'MSISDN',
          partyId: phone
        },
        payerMessage: paymentData.description || 'McCarthy Hill Coupon Top-Up',
        payeeNote: 'Wallet Funding'
      };

      const headers = this.getHeaders();

      return {
        referenceId,
        externalId,
        payload,
        headers,
        status: 'pending'
      };
    } catch (error) {
      throw new Error(`MTN Payment Initiation Error: ${error.message}`);
    }
  }

  /**
   * Verify payment status
   */
  async verifyPayment(referenceId) {
    try {
      const headers = this.getHeaders(true);
      
      // In production, you would call MTN API here
      // For now, returning mock response
      const response = {
        referenceId,
        status: 'PENDING',
        amount: 0,
        currency: 'GHS',
        externalId: '',
        payer: null,
        payee: null,
        reason: null,
        financialTransactionId: null
      };

      return response;
    } catch (error) {
      throw new Error(`MTN Verification Error: ${error.message}`);
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(referenceId) {
    try {
      // This would typically call the MTN API to get transaction status
      const status = await this.retryWithBackoff(async () => {
        return await this.verifyPayment(referenceId);
      }, 3, 2000);

      return status;
    } catch (error) {
      throw new Error(`Failed to get payment status: ${error.message}`);
    }
  }

  /**
   * Process webhook callback from MTN
   */
  async processWebhook(webhookData) {
    try {
      if (!this.validateWebhookSignature(webhookData.signature, webhookData.payload)) {
        throw new Error('Invalid webhook signature');
      }

      const { referenceId, status, amount, financialTransactionId } = webhookData.payload;

      if (status === 'SUCCESSFUL') {
        return {
          transactionId: referenceId,
          externalTransactionId: financialTransactionId,
          status: 'completed',
          amount,
          processedAt: new Date()
        };
      } else if (status === 'FAILED') {
        return {
          transactionId: referenceId,
          status: 'failed',
          reason: webhookData.payload.reason || 'Payment failed'
        };
      }

      return {
        transactionId: referenceId,
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
      const payloadString = JSON.stringify(payload);
      const hash = crypto
        .createHmac('sha256', this.primaryKey || '')
        .update(payloadString)
        .digest('base64');

      return hash === signature;
    } catch (error) {
      console.error('Signature validation error:', error);
      return false;
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(referenceId, amount) {
    try {
      const payload = {
        externalId: `REFUND_${referenceId}_${Date.now()}`,
        amount: amount.toString(),
        currency: 'GHS',
        reason: 'Refund requested',
        referenceId
      };

      const headers = this.getHeaders();

      return {
        refundId: this.generateUUID(),
        originalTransactionId: referenceId,
        amount,
        status: 'pending',
        requestedAt: new Date()
      };
    } catch (error) {
      throw new Error(`MTN Refund Error: ${error.message}`);
    }
  }

  /**
   * Get request headers for MTN API calls
   */
  getHeaders(isGet = false) {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Reference-Id': this.generateUUID(),
      'X-Target-Environment': this.targetEnvironment,
      'Ocp-Apim-Subscription-Key': this.subscriptionKey,
      'Content-Type': 'application/json',
      ...(isGet ? {} : { 'Content-Length': 0 })
    };
  }

  /**
   * Check if payment gateway is configured correctly
   */
  isConfigured() {
    return !!(this.apiKey && this.subscriptionKey);
  }

  /**
   * Get gateway info
   */
  getGatewayInfo() {
    return {
      name: this.name,
      provider: 'MTN',
      environment: this.targetEnvironment,
      supported_currencies: ['GHS'],
      min_amount: 1,
      max_amount: 10000,
      fee_percentage: 1.95,
      fee_fixed: 0
    };
  }
}

module.exports = MTNMobileMoneyGateway;
