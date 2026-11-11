const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { query, getClient } = require('../config/database');
const ResponseHandler = require('../utils/response');

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_BYTES = 72;
const GENERIC_REQUEST_MESSAGE = 'If an eligible account exists, a password reset request has been submitted.';
const isValidPassword = password => typeof password === 'string'
  && password.length >= PASSWORD_MIN_LENGTH
  && Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES;
const hashValue = value => crypto.createHash('sha256').update(value).digest('hex');
const requestContext = req => ({
  ipAddress: req.ip || 'unknown',
  userAgent: req.get('user-agent') || null
});

async function writeAudit(client, req, {
  requestId = null,
  subjectUserId = null,
  actorId = null,
  action,
  metadata = {}
}) {
  const context = requestContext(req);
  await client.query(
    `INSERT INTO password_reset_audit
       (request_id, subject_user_id, actor_superadmin_id, action, metadata, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [requestId, subjectUserId, actorId, action, JSON.stringify(metadata), context.ipAddress, context.userAgent]
  );
}

class PasswordResetController {
  static async createRequest(req, res) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return ResponseHandler.success(res, GENERIC_REQUEST_MESSAGE, { message: GENERIC_REQUEST_MESSAGE });
    }

    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      const userResult = await client.query(
        `SELECT id, role, status, email FROM users
         WHERE LOWER(BTRIM(email)) = $1 FOR UPDATE`,
        [email]
      );
      const user = userResult.rows[0];
      const bootstrapEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
      const eligible = user && user.status === 'active'
        && user.role !== 'super_admin'
        && !(user.role === 'admin' && user.email.trim().toLowerCase() === bootstrapEmail);

      if (eligible) {
        const pendingResult = await client.query(
          `SELECT id FROM password_reset_requests
           WHERE user_id = $1 AND status = 'pending' FOR UPDATE`,
          [user.id]
        );
        if (!pendingResult.rows[0]) {
          const created = await client.query(
            `INSERT INTO password_reset_requests (user_id) VALUES ($1) RETURNING id`,
            [user.id]
          );
          await writeAudit(client, req, {
            requestId: created.rows[0].id,
            subjectUserId: user.id,
            action: 'request_created'
          });
        }
      }

      await client.query('COMMIT');
      return ResponseHandler.success(res, GENERIC_REQUEST_MESSAGE, { message: GENERIC_REQUEST_MESSAGE });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Password reset request failed:', error.message);
      return ResponseHandler.serverError(res, 'Unable to submit password reset request');
    } finally {
      client?.release();
    }
  }

  static async listRequests(req, res) {
    try {
      const result = await query(
        `SELECT pr.id, pr.user_id, pr.status, pr.created_at, pr.updated_at, pr.decided_at,
                COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
                         NULLIF(BTRIM(CONCAT_WS(' ', s.first_name, s.last_name)), ''),
                         NULLIF(v.vendor_name, ''), u.username) AS full_name,
                u.email, u.role,
                assigned.username AS assigned_superadmin_username,
                assigned.email AS assigned_superadmin_email,
                latest.expires_at AS code_expires_at,
                latest.used_at AS code_used_at,
                latest.revoked_at AS code_revoked_at,
                latest.attempt_count AS code_attempt_count
         FROM password_reset_requests pr
         JOIN users u ON u.id = pr.user_id
         LEFT JOIN parents p ON p.user_id = u.id
         LEFT JOIN students s ON s.user_id = u.id
         LEFT JOIN vendors v ON v.user_id = u.id
         LEFT JOIN users assigned ON assigned.id = pr.assigned_superadmin_id
         LEFT JOIN LATERAL (
           SELECT expires_at, used_at, revoked_at, attempt_count
           FROM password_reset_codes
           WHERE request_id = pr.id
           ORDER BY created_at DESC, id DESC
           LIMIT 1
         ) latest ON true
         WHERE u.status <> 'deleted'
         ORDER BY CASE pr.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                  pr.created_at DESC
         LIMIT 200`
      );
      return ResponseHandler.success(res, 'Password reset requests retrieved', { requests: result.rows });
    } catch (error) {
      console.error('List password reset requests failed:', error.message);
      return ResponseHandler.serverError(res, 'Unable to retrieve password reset requests');
    }
  }

  static async decideRequest(req, res) {
    const requestId = Number(req.params.requestId);
    const decision = req.params.decision;
    if (!Number.isInteger(requestId) || requestId < 1 || !['approve', 'reject'].includes(decision)) {
      return ResponseHandler.badRequest(res, 'Invalid password reset request');
    }

    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      const requestResult = await client.query(
        `SELECT id, user_id, status FROM password_reset_requests WHERE id = $1 FOR UPDATE`,
        [requestId]
      );
      const resetRequest = requestResult.rows[0];
      if (!resetRequest) {
        await client.query('ROLLBACK');
        return ResponseHandler.notFound(res, 'Password reset request not found');
      }
      if (resetRequest.status !== 'pending') {
        await client.query('ROLLBACK');
        return ResponseHandler.error(res, 'Only pending requests can be approved or rejected', 409);
      }

      const status = decision === 'approve' ? 'approved' : 'rejected';
      await client.query(
        `UPDATE password_reset_requests
         SET status = $1, assigned_superadmin_id = $2,
             decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [status, req.user.id, requestId]
      );
      await writeAudit(client, req, {
        requestId,
        subjectUserId: resetRequest.user_id,
        actorId: req.user.id,
        action: decision === 'approve' ? 'request_approved' : 'request_rejected'
      });
      await client.query('COMMIT');
      return ResponseHandler.success(res, `Password reset request ${status}`, { requestId, status });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Password reset decision failed:', error.message);
      return ResponseHandler.serverError(res, 'Unable to update password reset request');
    } finally {
      client?.release();
    }
  }

  static async generateCode(req, res) {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId) || requestId < 1) {
      return ResponseHandler.badRequest(res, 'Invalid password reset request');
    }

    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      const requestResult = await client.query(
        `SELECT id, user_id, status FROM password_reset_requests WHERE id = $1 FOR UPDATE`,
        [requestId]
      );
      const resetRequest = requestResult.rows[0];
      if (!resetRequest) {
        await client.query('ROLLBACK');
        return ResponseHandler.notFound(res, 'Password reset request not found');
      }
      if (resetRequest.status !== 'approved') {
        await client.query('ROLLBACK');
        return ResponseHandler.error(res, 'Approve the request before generating a reset code', 409);
      }

      const rawCode = crypto.randomBytes(16).toString('hex');
      await client.query(
        `UPDATE password_reset_codes
         SET revoked_at = CURRENT_TIMESTAMP, reset_grant_hash = NULL, grant_expires_at = NULL
         WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
        [resetRequest.user_id]
      );
      await client.query(
        `INSERT INTO password_reset_codes
           (request_id, user_id, code_hash, generated_by, expires_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '15 minutes')`,
        [requestId, resetRequest.user_id, hashValue(rawCode), req.user.id]
      );
      await writeAudit(client, req, {
        requestId,
        subjectUserId: resetRequest.user_id,
        actorId: req.user.id,
        action: 'code_generated',
        metadata: { expiresInMinutes: 15 }
      });
      await client.query('COMMIT');
      return ResponseHandler.success(res, 'Reset code generated', { code: rawCode, expiresInMinutes: 15 });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Generate password reset code failed:', error.message);
      return ResponseHandler.serverError(res, 'Unable to generate reset code');
    } finally {
      client?.release();
    }
  }

  static async revokeCode(req, res) {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId) || requestId < 1) {
      return ResponseHandler.badRequest(res, 'Invalid password reset request');
    }

    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      const requestResult = await client.query(
        `SELECT id, user_id FROM password_reset_requests WHERE id = $1 FOR UPDATE`,
        [requestId]
      );
      const resetRequest = requestResult.rows[0];
      if (!resetRequest) {
        await client.query('ROLLBACK');
        return ResponseHandler.notFound(res, 'Password reset request not found');
      }
      const revoked = await client.query(
        `UPDATE password_reset_codes
         SET revoked_at = CURRENT_TIMESTAMP, reset_grant_hash = NULL, grant_expires_at = NULL
         WHERE request_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
        [requestId]
      );
      await writeAudit(client, req, {
        requestId,
        subjectUserId: resetRequest.user_id,
        actorId: req.user.id,
        action: 'code_revoked',
        metadata: { revokedCount: revoked.rowCount }
      });
      await client.query('COMMIT');
      return ResponseHandler.success(res, 'Reset code revoked', { revokedCount: revoked.rowCount });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Revoke password reset code failed:', error.message);
      return ResponseHandler.serverError(res, 'Unable to revoke reset code');
    } finally {
      client?.release();
    }
  }

  static async requestHistory(req, res) {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId) || requestId < 1) {
      return ResponseHandler.badRequest(res, 'Invalid password reset request');
    }
    try {
      const result = await query(
        `SELECT a.id, a.action, a.metadata, a.ip_address, a.created_at,
                actor.username AS actor_username, actor.email AS actor_email
         FROM password_reset_audit a
         LEFT JOIN users actor ON actor.id = a.actor_superadmin_id
         WHERE a.request_id = $1
         ORDER BY a.created_at DESC, a.id DESC`,
        [requestId]
      );
      return ResponseHandler.success(res, 'Password reset history retrieved', { history: result.rows });
    } catch (error) {
      console.error('Password reset history failed:', error.message);
      return ResponseHandler.serverError(res, 'Unable to retrieve password reset history');
    }
  }

  static async verifyCode(req, res) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toLowerCase() : '';
    if (!email || !/^[a-f0-9]{32}$/.test(code)) {
      return ResponseHandler.badRequest(res, 'The code is invalid, expired, or cannot be used');
    }

    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      const userResult = await client.query(
        `SELECT id, role, status, email FROM users
         WHERE LOWER(BTRIM(email)) = $1 FOR UPDATE`,
        [email]
      );
      const user = userResult.rows[0];
      const bootstrapEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
      const eligible = user && user.status === 'active'
        && user.role !== 'super_admin'
        && !(user.role === 'admin' && user.email.trim().toLowerCase() === bootstrapEmail);
      const codeResult = eligible ? await client.query(
        `SELECT id, request_id, code_hash, expires_at > CURRENT_TIMESTAMP AS not_expired,
                attempt_count, used_at, revoked_at
         FROM password_reset_codes
         WHERE user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1 FOR UPDATE`,
        [user.id]
      ) : { rows: [] };
      const resetCode = codeResult.rows[0];
      let validCode = false;
      if (resetCode) {
        const submittedHash = Buffer.from(hashValue(code), 'hex');
        const storedHash = Buffer.from(String(resetCode.code_hash).trim(), 'hex');
        const hashMatches = submittedHash.length === storedHash.length
          && crypto.timingSafeEqual(submittedHash, storedHash);
        const available = resetCode.not_expired && !resetCode.used_at && !resetCode.revoked_at
          && Number(resetCode.attempt_count) < 5;
        validCode = hashMatches && available;

        if (!validCode) {
          let reason = 'wrong_code';
          if (Number(resetCode.attempt_count) >= 5) reason = 'attempt_limit';
          else if (resetCode.revoked_at) reason = 'revoked';
          else if (resetCode.used_at) reason = 'used';
          else if (!resetCode.not_expired) reason = 'expired';
          if (reason === 'wrong_code' && available) {
            await client.query(
              `UPDATE password_reset_codes SET attempt_count = attempt_count + 1 WHERE id = $1`,
              [resetCode.id]
            );
          }
          await writeAudit(client, req, {
            requestId: resetCode.request_id,
            subjectUserId: user.id,
            action: 'verification_failed',
            metadata: {
              reason,
              attemptCount: Math.min(5, Number(resetCode.attempt_count) + (reason === 'wrong_code' && available ? 1 : 0))
            }
          });
        } else {
          const resetGrant = crypto.randomBytes(32).toString('hex');
          await client.query(
            `UPDATE password_reset_codes
             SET verified_at = CURRENT_TIMESTAMP, reset_grant_hash = $1,
                 grant_expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
             WHERE id = $2`,
            [hashValue(resetGrant), resetCode.id]
          );
          await writeAudit(client, req, {
            requestId: resetCode.request_id,
            subjectUserId: user.id,
            action: 'code_verified'
          });
          await client.query('COMMIT');
          return ResponseHandler.success(res, 'Code verified', { resetGrant });
        }
      }

      await client.query('COMMIT');
      return ResponseHandler.badRequest(res, 'The code is invalid, expired, or cannot be used');
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Password reset code verification failed:', error.message);
      return ResponseHandler.serverError(res, 'Unable to verify reset code');
    } finally {
      client?.release();
    }
  }

  static async resetPassword(req, res) {
    const { resetGrant, newPassword, confirmPassword } = req.body || {};
    if (typeof resetGrant !== 'string' || !/^[a-f0-9]{64}$/i.test(resetGrant)
      || !newPassword || !confirmPassword) {
      return ResponseHandler.badRequest(res, 'A verified reset session and all password fields are required');
    }
    if (newPassword !== confirmPassword) return ResponseHandler.badRequest(res, 'Passwords do not match');
    if (!isValidPassword(newPassword)) {
      return ResponseHandler.badRequest(res, `Password must be at least ${PASSWORD_MIN_LENGTH} characters and no more than ${PASSWORD_MAX_BYTES} UTF-8 bytes`);
    }

    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      const resetGrantHash = hashValue(resetGrant);
      const ownerResult = await client.query(
        `SELECT u.id, u.role, u.email, u.status
         FROM users u
         WHERE u.id = (
           SELECT user_id FROM password_reset_codes WHERE reset_grant_hash = $1
         )
         FOR UPDATE`,
        [resetGrantHash]
      );
      const owner = ownerResult.rows[0];
      const grantResult = owner?.status === 'active' ? await client.query(
        `SELECT id, request_id, user_id
         FROM password_reset_codes
         WHERE reset_grant_hash = $1 AND user_id = $2
           AND grant_expires_at > CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP
           AND used_at IS NULL AND revoked_at IS NULL AND attempt_count < 5
         FOR UPDATE`,
        [resetGrantHash, owner.id]
      ) : { rows: [] };
      const grant = grantResult.rows[0]
        ? { ...grantResult.rows[0], role: owner.role, email: owner.email }
        : null;
      const bootstrapEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
      if (!grant || grant.role === 'super_admin'
        || (grant.role === 'admin' && grant.email.trim().toLowerCase() === bootstrapEmail)) {
        await client.query('ROLLBACK');
        return ResponseHandler.badRequest(res, 'The password reset session is invalid or expired');
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await client.query(
        `UPDATE users SET password_hash = $1, token_version = token_version + 1,
                          updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [passwordHash, grant.user_id]
      );
      await client.query(
        `UPDATE password_reset_codes
         SET used_at = CURRENT_TIMESTAMP, reset_grant_hash = NULL, grant_expires_at = NULL
         WHERE id = $1`,
        [grant.id]
      );
      await client.query(
        `UPDATE password_reset_codes
         SET revoked_at = CURRENT_TIMESTAMP, reset_grant_hash = NULL, grant_expires_at = NULL
         WHERE user_id = $1 AND id <> $2 AND used_at IS NULL AND revoked_at IS NULL`,
        [grant.user_id, grant.id]
      );
      await writeAudit(client, req, {
        requestId: grant.request_id,
        subjectUserId: grant.user_id,
        action: 'password_changed'
      });
      await client.query('COMMIT');
      return ResponseHandler.success(res, 'Password reset successfully');
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Password reset failed:', error.message);
      return ResponseHandler.serverError(res, 'Unable to reset password');
    } finally {
      client?.release();
    }
  }
}

module.exports = PasswordResetController;