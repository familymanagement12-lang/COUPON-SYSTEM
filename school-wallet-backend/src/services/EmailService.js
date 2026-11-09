const nodemailer = require('nodemailer');

class EmailService {
  static isConfigured() {
    const hasCredentials = Boolean(process.env.MAIL_USER && process.env.MAIL_PASSWORD);
    const partialCredentials = Boolean(process.env.MAIL_USER) !== Boolean(process.env.MAIL_PASSWORD);
    return Boolean(process.env.MAIL_HOST && process.env.MAIL_PORT && process.env.MAIL_FROM)
      && !partialCredentials
      && (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production' || hasCredentials);
  }

  static async sendPasswordReset(to, resetUrl) {
    if (!this.isConfigured()) {
      throw new Error('Password reset email is not configured');
    }

    const port = Number(process.env.MAIL_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('MAIL_PORT must be a valid TCP port');
    }

    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port,
      secure: process.env.MAIL_SECURE === 'true' || port === 465,
      ...(process.env.MAIL_USER
        ? { auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD } }
        : {})
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject: 'Reset your McCarthy Hill School Coupon System password',
      text: `Use this link within 30 minutes to reset your password:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this link within 30 minutes to reset your password:</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`
    });
  }
}

module.exports = EmailService;
