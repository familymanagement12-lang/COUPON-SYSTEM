const { query } = require('../config/database');

class NotificationService {
  static async sendSMS(phone, message) {
    // Stub: log and save to notifications table
    console.log(`SMS to ${phone}: ${message}`);
    try {
      await query(`INSERT INTO notifications (channel, recipient, message, status, created_at) VALUES ($1,$2,$3,$4,NOW())`, ['sms', phone, message, 'queued']);
    } catch (e) {
      console.warn('Failed to record notification:', e.message);
    }
    return { success: true };
  }

  static async sendEmail(email, subject, body) {
    console.log(`Email to ${email}: ${subject}`);
    try {
      await query(`INSERT INTO notifications (channel, recipient, message, status, created_at) VALUES ($1,$2,$3,$4,NOW())`, ['email', email, subject + '\n' + body, 'queued']);
    } catch (e) {
      console.warn('Failed to record notification:', e.message);
    }
    return { success: true };
  }

  static async sendPush(userId, payload) {
    console.log(`Push to ${userId}:`, payload);
    try {
      await query(`INSERT INTO notifications (channel, recipient, message, status, created_at) VALUES ($1,$2,$3,$4,NOW())`, ['push', userId, JSON.stringify(payload), 'queued']);
    } catch (e) {
      console.warn('Failed to record notification:', e.message);
    }
    return { success: true };
  }
}

module.exports = NotificationService;
