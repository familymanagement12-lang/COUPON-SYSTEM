const crypto = require('crypto');
const https = require('https');
const PaymentGateway = require('./PaymentGateway');

/**
 * Paystack Payment Gateway Integration
 * https://paystack.com/docs/api/
 */
class PaystackGateway extends PaymentGateway {
  constructor() {
    super();
    this.provider = 'paystack';
    this.baseUrl = 'https://api.paystack.co';
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY;
    this.environment = process.env.PAYSTACK_ENVIRONMENT || 'test';

    if (!this.secretKey || !this.publicKey) {
      console.warn('⚠️ Paystack credentials not configured. Set PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY in .env');
    }
  }

  /**
   * Initiate a payment transaction with Paystack
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Payment initialization response
   */
  async initiatePayment(paymentData) {
    try {
      this.validatePaymentData(paymentData);

      const { amount, phone, email, name, transactionReference, studentId, callbackUrl } = paymentData;

      // Validate amount and phone
      this.validateAmount(amount);
      this.validatePhoneNumber(phone);

      // Prepare request payload
      const payload = {
        email: email || `parent_${studentId}@school-wallet.local`,
        amount: Math.round(amount * 100), // Paystack expects amount in cents
        reference: transactionReference,
        metadata: {
          studentId,
          phone: this.formatPhoneNumber(phone, 'international'),
          name,
          provider: 'paystack',
          timestamp: new Date().toISOString(),
        },
      };

      if (callbackUrl) {
        payload.callback_url = callbackUrl;
      }

      // Make API request with retry logic
      const response = await this.retryWithBackoff(async () => {
        return await this.makeRequest('POST', '/transaction/initialize', payload);
      });

      if (!response.status) {
        throw new Error(`Paystack initialization failed: ${response.message}`);
      }

      return {
        success: true,
        provider: 'paystack',
        transactionReference,
        paymentUrl: response.data.authorization_url,
        accessCode: response.data.access_code,
        reference: response.data.reference,
        message: response.message,
      };
    } catch (error) {
      console.error('❌ Paystack initiation error:', error.message);
      return {
        success: false,
        provider: 'paystack',
        error: error.message,
      };
    }
  }

  /**
   * Verify a payment transaction with Paystack
   * @param {string} reference - Transaction reference
   * @returns {Promise<Object>} Verification response
   */
  async verifyPayment(reference) {
    try {
      if (!reference) {
        throw new Error('Transaction reference required for verification');
      }

      // Make API request with retry logic
      const response = await this.retryWithBackoff(async () => {
        return await this.makeRequest('GET', `/transaction/verify/${reference}`);
      });

      if (!response.status) {
        return {
          success: false,
          reference,
          status: 'failed',
          error: response.message,
        };
      }

      const transaction = response.data;

      return {
        success: transaction.status === 'success',
        reference: transaction.reference,
        status: transaction.status,
        amount: transaction.amount / 100, // Convert from cents
        currency: transaction.currency,
        authorizedUrl: transaction.authorization_url,
        message: response.message,
      };
    } catch (error) {
      console.error('❌ Paystack verification error:', error.message);
      return {
        success: false,
        reference,
        error: error.message,
      };
    }
  }

  /**
   * Get payment status from Paystack
   * @param {string} reference - Transaction reference
   * @returns {Promise<Object>} Payment status
   */
  async getPaymentStatus(reference) {
    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.makeRequest('GET', `/transaction/verify/${reference}`);
      });

      if (!response.status) {
        return {
          status: 'unknown',
          message: response.message,
        };
      }

      const transaction = response.data;
      const statusMap = {
        'success': 'completed',
        'failed': 'failed',
        'abandoned': 'cancelled',
        'pending': 'pending',
      };

      return {
        status: statusMap[transaction.status] || transaction.status,
        reference: transaction.reference,
        amount: transaction.amount / 100,
        currency: transaction.currency,
        paidAt: transaction.paid_at,
      };
    } catch (error) {
      console.error('❌ Paystack status check error:', error.message);
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Process webhook from Paystack
   * @param {Object} body - Webhook payload
   * @param {string} signature - X-Paystack-Signature header
   * @returns {Promise<Object>} Webhook processing result
   */
  async processWebhook(body, signature) {
    try {
      // Validate webhook signature
      const isValid = this.validateWebhookSignature(JSON.stringify(body), signature);

      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }

      const { event, data } = body;

      // Handle charge completion
      if (event === 'charge.success') {
        const { reference, amount, customer, metadata } = data;

        return {
          success: true,
          event,
          reference,
          amount: amount / 100, // Convert from cents
          email: customer.email,
          studentId: metadata?.studentId,
          timestamp: new Date().toISOString(),
        };
      }

      // Handle charge failure
      if (event === 'charge.failed') {
        return {
          success: false,
          event,
          reference: data.reference,
          reason: data.failure_reason,
        };
      }

      return {
        success: true,
        event,
        message: `Event ${event} processed`,
      };
    } catch (error) {
      console.error('❌ Paystack webhook error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validate webhook signature using HMAC-SHA512
   * @param {string} body - Request body as string
   * @param {string} signature - X-Paystack-Signature header value
   * @returns {boolean} True if signature is valid
   */
  validateWebhookSignature(body, signature) {
    try {
      const hash = crypto
        .createHmac('sha512', this.secretKey)
        .update(body)
        .digest('hex');

      return hash === signature;
    } catch (error) {
      console.error('❌ Webhook signature validation error:', error.message);
      return false;
    }
  }

  /**
   * Refund a payment with Paystack
   * @param {string} reference - Original transaction reference
   * @param {number} amount - Refund amount (optional, defaults to full refund)
   * @returns {Promise<Object>} Refund response
   */
  async refundPayment(reference, amount = null) {
    try {
      if (!reference) {
        throw new Error('Transaction reference required for refund');
      }

      const payload = {
        transaction: reference,
      };

      if (amount) {
        this.validateAmount(amount);
        payload.amount = Math.round(amount * 100); // Convert to cents
      }

      const response = await this.retryWithBackoff(async () => {
        return await this.makeRequest('POST', '/refund', payload);
      });

      if (!response.status) {
        throw new Error(`Paystack refund failed: ${response.message}`);
      }

      return {
        success: true,
        reference: response.data.reference,
        status: response.data.status,
        amount: response.data.amount / 100,
        message: response.message,
      };
    } catch (error) {
      console.error('❌ Paystack refund error:', error.message);
      return {
        success: false,
        reference,
        error: error.message,
      };
    }
  }

  /**
   * Make HTTP request to Paystack API
   * @param {string} method - HTTP method
   * @param {string} path - API endpoint path
   * @param {Object} data - Request payload
   * @returns {Promise<Object>} API response
   * @private
   */
  makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);

      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse Paystack response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Paystack request failed: ${error.message}`));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * Check if payment gateway is configured correctly
   */
  isConfigured() {
    return !!(this.secretKey && this.publicKey);
  }

  /**
   * Get gateway info
   */
  getGatewayInfo() {
    return {
      name: 'Paystack',
      provider: 'paystack',
      environment: this.environment,
      supported_currencies: ['GHS', 'NGN', 'ZAR', 'USD'],
      min_amount: 1,
      max_amount: 10000,
      fee_percentage: 1.5,
      fee_fixed: 0
    };
  }
}

module.exports = PaystackGateway;
