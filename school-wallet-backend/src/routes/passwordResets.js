const express = require('express');
const PasswordResetController = require('../controllers/PasswordResetController');
const { authenticateToken, authorizeSuperAdmin, rateLimiter } = require('../middleware/auth');

const router = express.Router();
router.use(rateLimiter(15 * 60 * 1000, 100));
router.use(authenticateToken, authorizeSuperAdmin);

router.get('/', PasswordResetController.listRequests);
router.get('/:requestId/history', PasswordResetController.requestHistory);
router.post('/:requestId/approve', (req, res) => {
  req.params.decision = 'approve';
  return PasswordResetController.decideRequest(req, res);
});
router.post('/:requestId/reject', (req, res) => {
  req.params.decision = 'reject';
  return PasswordResetController.decideRequest(req, res);
});
router.post('/:requestId/code', PasswordResetController.generateCode);
router.post('/:requestId/revoke-code', PasswordResetController.revokeCode);

module.exports = router;