const SpendingLimit = require('../models/SpendingLimit');
const ResponseHandler = require('../utils/response');
const Parent = require('../models/Parent');

const parseLimit = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Limits must be positive numbers.');
  }
  return parsed;
};

class SpendingController {
  static async authorizeStudentAccess(req, studentId) {
    if (req.user.role === 'admin') return true;

    const parent = await Parent.findByUserId(req.user.id);
    if (!parent) return false;

    const children = await Parent.getChildren(parent.id);
    return children.some(child => Number(child.id) === Number(studentId));
  }

  static async getLimits(req, res) {
    try {
      const { studentId } = req.params;
      const canAccess = await SpendingController.authorizeStudentAccess(req, studentId);
      if (!canAccess) return ResponseHandler.forbidden(res, 'You cannot access spending limits for this student');

      const limits = await SpendingLimit.getByStudent(studentId);
      return ResponseHandler.success(res, 'Spending limits', {
        limits: limits || {
          student_id: Number(studentId),
          daily_limit: null,
          weekly_limit: null
        }
      });
    } catch (error) {
      console.error('Get spending limits error:', error);
      return ResponseHandler.serverError(res, 'Failed to retrieve limits');
    }
  }

  static async setLimits(req, res) {
    try {
      const { studentId } = req.params;
      const canAccess = await SpendingController.authorizeStudentAccess(req, studentId);
      if (!canAccess) return ResponseHandler.forbidden(res, 'You cannot update spending limits for this student');

      const data = {
        daily_limit: parseLimit(req.body.daily_limit),
        weekly_limit: parseLimit(req.body.weekly_limit)
      };
      if (data.daily_limit !== null && data.weekly_limit !== null && data.daily_limit > data.weekly_limit) {
        return ResponseHandler.badRequest(res, 'Daily limit cannot be greater than weekly limit');
      }

      const updated = await SpendingLimit.setForStudent(studentId, data);
      return ResponseHandler.success(res, 'Spending limits updated', { limits: updated });
    } catch (error) {
      console.error('Set spending limits error:', error);
      if (error.message.includes('Limits must')) {
        return ResponseHandler.badRequest(res, error.message);
      }
      return ResponseHandler.serverError(res, 'Failed to set limits');
    }
  }
}

module.exports = SpendingController;
