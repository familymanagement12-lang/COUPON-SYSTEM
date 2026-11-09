const SpendingLimit = require('../models/SpendingLimit');
const Transaction = require('../models/Transaction');

class SpendingControlService {
  /**
   * Check spending limits for a proposed purchase
   * Throws error if limit exceeded
   */
  static async checkLimits(studentId, walletId, amount, category = null) {
    const limits = await SpendingLimit.getByStudent(studentId);
    if (!limits) return true; // no limits set

    // Check daily limit
    if (limits.daily_limit) {
      const since = new Date();
      since.setHours(0,0,0,0);
      const spent = await Transaction.sumForPeriod(walletId, since.toISOString());
      if ((spent + amount) > parseFloat(limits.daily_limit)) {
        throw new Error('Daily spending limit exceeded');
      }
    }

    // Check weekly limit
    if (limits.weekly_limit) {
      const since = new Date();
      const day = since.getDay();
      const diff = since.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(since.setDate(diff));
      monday.setHours(0,0,0,0);
      const spent = await Transaction.sumForPeriod(walletId, monday.toISOString());
      if ((spent + amount) > parseFloat(limits.weekly_limit)) {
        throw new Error('Weekly spending limit exceeded');
      }
    }

    // Category restrictions (stored as JSON array in DB)
    if (category && limits.categories) {
      try {
        const cats = JSON.parse(limits.categories);
        if (cats.blocked && cats.blocked.includes(category)) {
          throw new Error('Category blocked for purchases');
        }
      } catch (e) {
        // ignore parse errors
      }
    }

    // Time restrictions not implemented in-depth here (stub)

    return true;
  }
}

module.exports = SpendingControlService;
