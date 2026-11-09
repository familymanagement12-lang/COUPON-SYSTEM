/**
 * Abstract Payment Gateway Base Class
 * All payment providers must extend this class
 */
class PaymentGateway {
  constructor(config = {}) {
    if (new.target === PaymentGateway) {
      throw new TypeError('Cannot instantiate abstract class PaymentGateway');
    }
    this.config = config;
    this.name = config.name || 'Unknown Gateway';
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || '';
    this.timeout = config.timeout || 30000;
  }

  /**
   * Initiate payment (must be implemented by subclass)
   */
  async initiatePayment(paymentData) {
    throw new Error('initiatePayment() must be implemented by subclass');
  }

  /**
   * Verify payment status (must be implemented by subclass)
   */
  async verifyPayment(transactionId) {
    throw new Error('verifyPayment() must be implemented by subclass');
  }

  /**
   * Process webhook callback (must be implemented by subclass)
   */
  async processWebhook(webhookData) {
    throw new Error('processWebhook() must be implemented by subclass');
  }

  /**
   * Validate webhook signature (must be implemented by subclass)
   */
  validateWebhookSignature(signature, payload) {
    throw new Error('validateWebhookSignature() must be implemented by subclass');
  }

  /**
   * Get payment status (must be implemented by subclass)
   */
  async getPaymentStatus(transactionId) {
    throw new Error('getPaymentStatus() must be implemented by subclass');
  }

  /**
   * Refund payment (must be implemented by subclass)
   */
  async refundPayment(transactionId, amount) {
    throw new Error('refundPayment() must be implemented by subclass');
  }

  /**
   * Common validation for payment data
   */
  validatePaymentData(paymentData) {
    if (!paymentData.phone) {
      throw new Error('Phone number is required');
    }
    if (!paymentData.amount || paymentData.amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    if (!paymentData.description) {
      throw new Error('Payment description is required');
    }
    return true;
  }

  /**
   * Generate transaction reference
   */
  generateTransactionReference() {
    return `${this.name.toUpperCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate amount
   */
  validateAmount(amount, minAmount = 1, maxAmount = 10000) {
    if (amount < minAmount) {
      throw new Error(`Amount must be at least ${minAmount}`);
    }
    if (amount > maxAmount) {
      throw new Error(`Amount cannot exceed ${maxAmount}`);
    }
    return true;
  }

  /**
   * Validate phone number (format: +233XXXXXXXXXX or 0XXXXXXXXXX)
   */
  validatePhoneNumber(phone) {
    const phoneRegex = /^(\+233|0)[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
      throw new Error('Parent phone number must be a valid Ghana number');
    }
    return true;
  }

  /**
   * Format phone number to international format
   */
  formatPhoneNumber(phone) {
    if (phone.startsWith('0')) {
      return '+233' + phone.substring(1);
    }
    return phone;
  }

  /**
   * Format phone number to local format
   */
  formatPhoneLocal(phone) {
    if (phone.startsWith('+233')) {
      return '0' + phone.substring(4);
    }
    return phone;
  }

  /**
   * Retry logic with exponential backoff
   */
  async retryWithBackoff(fn, maxRetries = 3, delay = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          const waitTime = delay * Math.pow(2, i);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    throw lastError;
  }
}

module.exports = PaymentGateway;
