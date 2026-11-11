const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-123456';
process.env.SUPER_ADMIN_EMAIL = 'owner@example.test';

const database = require('../src/config/database');
const PasswordResetController = require('../src/controllers/PasswordResetController');
const { authorizeSuperAdmin } = require('../src/middleware/auth');

let state;

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function request(body = {}, user = null) {
  return {
    body,
    user,
    params: {},
    ip: '127.0.0.1',
    get: () => 'test-agent'
  };
}

function createState(role = 'parent') {
  return {
    user: {
      id: 21,
      email: 'jane.parent@example.test',
      role,
      status: 'active',
      password_hash: null,
      token_version: 0
    },
    resetRequest: null,
    code: null,
    audit: []
  };
}

database.pool.connect = async () => ({
  async query(sql, params = []) {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
    if (/SELECT id, role, status, email FROM users/i.test(sql)) {
      return params[0] === state.user.email ? { rows: [{ ...state.user }] } : { rows: [] };
    }
    if (/SELECT u\.id, u\.role, u\.email, u\.status\s+FROM users/i.test(sql)) {
      return state.code?.reset_grant_hash === params[0]
        ? { rows: [{ id: state.user.id, role: state.user.role, email: state.user.email, status: state.user.status }] }
        : { rows: [] };
    }
    if (/SELECT id FROM password_reset_requests/i.test(sql)) return { rows: [] };
    if (/INSERT INTO password_reset_requests/i.test(sql)) {
      state.resetRequest = { id: 9, user_id: params[0], status: 'pending' };
      return { rows: [{ id: state.resetRequest.id }] };
    }
    if (/SELECT id, user_id, status FROM password_reset_requests/i.test(sql)) {
      return state.resetRequest && Number(params[0]) === state.resetRequest.id
        ? { rows: [{ ...state.resetRequest }] }
        : { rows: [] };
    }
    if (/UPDATE password_reset_requests/i.test(sql)) {
      state.resetRequest.status = params[0];
      state.resetRequest.assigned_superadmin_id = params[1];
      return { rows: [] };
    }
    if (/UPDATE password_reset_codes/i.test(sql) && /SET revoked_at/i.test(sql)) {
      if (state.code && !state.code.used_at) state.code.revoked_at = new Date().toISOString();
      return { rows: [], rowCount: state.code && !state.code.used_at ? 1 : 0 };
    }
    if (/INSERT INTO password_reset_codes/i.test(sql)) {
      state.code = {
        id: 14,
        request_id: params[0],
        user_id: params[1],
        code_hash: params[2],
        generated_by: params[3],
        not_expired: true,
        attempt_count: 0,
        used_at: null,
        revoked_at: null,
        reset_grant_hash: null
      };
      return { rows: [] };
    }
    if (/INSERT INTO password_reset_audit/i.test(sql)) {
      state.audit.push({ action: params[3], metadata: params[4] });
      return { rows: [] };
    }
    if (/SELECT id, request_id, code_hash, expires_at/i.test(sql)) {
      return state.code ? { rows: [{ ...state.code }] } : { rows: [] };
    }
    if (/SET attempt_count = attempt_count \+ 1/i.test(sql)) {
      state.code.attempt_count += 1;
      return { rows: [], rowCount: 1 };
    }
    if (/SET verified_at = CURRENT_TIMESTAMP/i.test(sql)) {
      state.code.reset_grant_hash = params[0];
      return { rows: [] };
    }
    if (/SELECT id, request_id, user_id\s+FROM password_reset_codes/i.test(sql)) {
      if (state.code?.reset_grant_hash === params[0] && state.code.not_expired
        && !state.code.used_at && !state.code.revoked_at && state.code.attempt_count < 5) {
        return { rows: [{
          id: state.code.id,
          request_id: state.code.request_id,
          user_id: state.user.id
        }] };
      }
      return { rows: [] };
    }
    if (/UPDATE users SET password_hash/i.test(sql)) {
      state.user.password_hash = params[0];
      state.user.token_version += 1;
      return { rows: [], rowCount: 1 };
    }
    if (/SET used_at = CURRENT_TIMESTAMP/i.test(sql)) {
      state.code.used_at = new Date().toISOString();
      state.code.reset_grant_hash = null;
      return { rows: [], rowCount: 1 };
    }
    if (/SET revoked_at = CURRENT_TIMESTAMP/i.test(sql)) {
      if (state.code && !state.code.used_at) state.code.revoked_at = new Date().toISOString();
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected transaction query: ${sql}`);
  },
  release() {}
});

test('approved request flows through one-time code to password reset and JWT invalidation', async () => {
  state = createState();
  state.user.password_hash = await bcrypt.hash('old-secure-password-123', 10);

  const submitted = response();
  await PasswordResetController.createRequest(request({ email: state.user.email }), submitted);
  assert.equal(submitted.statusCode, 200);
  assert.match(submitted.body.message, /If an eligible account exists/);
  assert.equal(state.resetRequest.status, 'pending');
  assert.equal(state.audit[0].action, 'request_created');

  const admin = { id: 4, role: 'super_admin' };
  const approved = response();
  const approvalRequest = request({}, admin);
  approvalRequest.params = { requestId: '9', decision: 'approve' };
  await PasswordResetController.decideRequest(approvalRequest, approved);
  assert.equal(approved.statusCode, 200);
  assert.equal(state.resetRequest.status, 'approved');
  assert.equal(state.audit.at(-1).action, 'request_approved');

  const generated = response();
  await PasswordResetController.generateCode(Object.assign(request({}, admin), { params: { requestId: '9' } }), generated);
  assert.equal(generated.statusCode, 200);
  const rawCode = generated.body.data.code;
  assert.equal(rawCode.length, 32);
  assert.notEqual(state.code.code_hash, rawCode);
  assert.equal(state.audit.at(-1).action, 'code_generated');
  assert.doesNotMatch(JSON.stringify(state.audit), new RegExp(rawCode));

  const verified = response();
  await PasswordResetController.verifyCode(request({ email: state.user.email, code: rawCode }), verified);
  assert.equal(verified.statusCode, 200);
  assert.ok(verified.body.data.resetGrant);

  const reset = response();
  await PasswordResetController.resetPassword(request({
    resetGrant: verified.body.data.resetGrant,
    newPassword: 'new-secure-password-456',
    confirmPassword: 'new-secure-password-456'
  }), reset);
  assert.equal(reset.statusCode, 200);
  assert.equal(state.code.used_at !== null, true);
  assert.equal(state.user.token_version, 1);
  assert.equal(await bcrypt.compare('old-secure-password-123', state.user.password_hash), false);
  assert.equal(await bcrypt.compare('new-secure-password-456', state.user.password_hash), true);

  const reused = response();
  await PasswordResetController.resetPassword(request({
    resetGrant: verified.body.data.resetGrant,
    newPassword: 'another-new-password-789',
    confirmPassword: 'another-new-password-789'
  }), reused);
  assert.equal(reused.statusCode, 400);
});

test('five incorrect codes lock verification and expired codes are rejected', async () => {
  state = createState();
  state.resetRequest = { id: 9, user_id: state.user.id, status: 'approved' };
  const correctCode = crypto.randomBytes(16).toString('hex');
  state.code = {
    id: 14,
    request_id: 9,
    user_id: 21,
    code_hash: crypto.createHash('sha256').update(correctCode).digest('hex'),
    not_expired: true,
    attempt_count: 0,
    used_at: null,
    revoked_at: null
  };
  const wrongCode = '0'.repeat(32);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = response();
    await PasswordResetController.verifyCode(request({ email: state.user.email, code: wrongCode }), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(state.code.attempt_count, 5);
  assert.equal(state.audit.filter(entry => entry.action === 'verification_failed').length, 6);

  state.code.attempt_count = 0;
  state.code.not_expired = false;
  const expired = response();
  await PasswordResetController.verifyCode(request({ email: state.user.email, code: correctCode }), expired);
  assert.equal(expired.statusCode, 400);
  assert.equal(state.audit.at(-1).metadata.includes('expired'), true);
});

test('Superadmin recovery is excluded and regular users cannot call administrative actions', async () => {
  state = createState('super_admin');
  const responseForAdmin = response();
  await PasswordResetController.createRequest(request({ email: state.user.email }), responseForAdmin);
  assert.equal(responseForAdmin.statusCode, 200);
  assert.equal(state.resetRequest, null);

  let continued = false;
  const forbidden = response();
  authorizeSuperAdmin({ user: { id: 21, role: 'parent' } }, forbidden, () => { continued = true; });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(continued, false);
});

test.after(async () => {
  await database.pool.end();
});