const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-123456';
process.env.SUPER_ADMIN_EMAIL = 'admin@example.test';
delete process.env.MAIL_HOST;
delete process.env.MAIL_PORT;
delete process.env.MAIL_USER;
delete process.env.MAIL_PASSWORD;
delete process.env.MAIL_FROM;

const database = require('../src/config/database');
const AuthController = require('../src/controllers/AuthController');
const { rateLimiter } = require('../src/middleware/auth');

let queryHandler = async () => ({ rows: [] });
let clientHandler = async () => ({ query: async () => ({ rows: [] }), release() {} });
database.pool.query = (...args) => queryHandler(...args);
database.pool.connect = (...args) => clientHandler(...args);

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

function parentRegistration(body = {}) {
  return {
    username: 'jane.parent',
    email: 'Jane.Parent@example.test',
    phone: '+233201234567',
    firstName: 'Jane',
    lastName: 'Parent',
    password: 'a-secure-password-123',
    confirmPassword: 'a-secure-password-123',
    ...body
  };
}

test('public registration ignores requested privileged role and atomically creates a parent', async () => {
  const statements = [];
  queryHandler = async (sql) => {
    if (/SELECT id FROM users WHERE LOWER\(BTRIM\(email\)\)/i.test(sql)) return { rows: [] };
    if (/SELECT \* FROM users WHERE username/i.test(sql)) return { rows: [] };
    throw new Error(`Unexpected database query: ${sql}`);
  };
  clientHandler = async () => ({
    async query(sql, params = []) {
      statements.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (/INSERT INTO users/i.test(sql)) {
        return {
          rows: [{
            id: 21,
            username: params[0],
            email: params[1],
            phone: params[2],
            role: params[4],
            status: 'active'
          }]
        };
      }
      if (/INSERT INTO parents/i.test(sql)) {
        return { rows: [{ id: 31, user_id: params[0] }] };
      }
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    release() {}
  });

  const res = response();
  await AuthController.register({ body: parentRegistration({ role: 'admin' }) }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.user.role, 'parent');
  assert.equal(res.body.data.user.email, 'jane.parent@example.test');
  assert.equal(res.body.data.user.parentId, 31);
  assert.ok(res.body.data.tokens.accessToken);
  assert.deepEqual(statements.slice(0, 1), ['BEGIN']);
  assert.equal(statements.at(-1), 'COMMIT');
  assert.equal(statements.some((sql) => /INSERT INTO parents/i.test(sql)), true);
});

test('registration rejects duplicate email and handles a concurrent unique-index conflict', async () => {
  queryHandler = async (sql) => {
    if (/SELECT id FROM users WHERE LOWER\(BTRIM\(email\)\)/i.test(sql)) return { rows: [{ id: 3 }] };
    throw new Error(`Unexpected database query: ${sql}`);
  };
  let connectionRequested = false;
  clientHandler = async () => {
    connectionRequested = true;
    throw new Error('No transaction should be opened for a known duplicate');
  };

  const duplicate = response();
  await AuthController.register({ body: parentRegistration({ email: 'JANE.PARENT@EXAMPLE.TEST' }) }, duplicate);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(connectionRequested, false);

  queryHandler = async () => ({ rows: [] });
  let rolledBack = false;
  clientHandler = async () => ({
    async query(sql) {
      if (sql === 'ROLLBACK') rolledBack = true;
      if (/INSERT INTO users/i.test(sql)) {
        const error = new Error('unique violation');
        error.code = '23505';
        error.constraint = 'idx_users_email_lower';
        throw error;
      }
      return { rows: [] };
    },
    release() {}
  });
  const concurrent = response();
  await AuthController.register({ body: parentRegistration() }, concurrent);
  assert.equal(concurrent.statusCode, 409);
  assert.equal(concurrent.body.message, 'Email already registered');
  assert.equal(rolledBack, true);
});

test('existing login accepts a registered parent account and verifies its bcrypt hash', async () => {
  const password = 'a-secure-password-123';
  const passwordHash = await bcrypt.hash(password, 10);
  queryHandler = async (sql) => {
    if (/SELECT \* FROM users WHERE LOWER\(BTRIM\(email\)\)/i.test(sql)) {
      return {
        rows: [{
          id: 21,
          username: 'jane.parent',
          email: 'jane.parent@example.test',
          phone: '+233201234567',
          role: 'parent',
          status: 'active',
          password_hash: passwordHash
        }]
      };
    }
    if (/SELECT p\.\*/i.test(sql)) return { rows: [{ id: 31 }] };
    if (/INSERT INTO audit_logs/i.test(sql)) return { rows: [] };
    throw new Error(`Unexpected database query: ${sql}`);
  };

  const res = response();
  await AuthController.login({
    body: { identifier: '[JANE.PARENT@example.test](mailto:jane.parent@example.test)', password },
    ip: '127.0.0.1'
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.user.parentId, 31);
  assert.ok(res.body.data.tokens.accessToken);
});

test('password reset rate limit is isolated by normalized email for a shared IP', () => {
  const limiter = rateLimiter(60_000, 1, req => `${req.ip}:${req.body.email.trim().toLowerCase()}`);
  const request = email => ({ ip: '192.0.2.44', body: { email } });

  const first = response();
  let firstPassed = false;
  limiter(request('person.one@example.test'), first, () => { firstPassed = true; });
  assert.equal(firstPassed, true);

  const normalizedDuplicate = response();
  let duplicatePassed = false;
  limiter(request(' PERSON.ONE@EXAMPLE.TEST '), normalizedDuplicate, () => { duplicatePassed = true; });
  assert.equal(normalizedDuplicate.statusCode, 429);
  assert.equal(duplicatePassed, false);

  const anotherFamily = response();
  let anotherPassed = false;
  limiter(request('person.two@example.test'), anotherFamily, () => { anotherPassed = true; });
  assert.equal(anotherPassed, true);
});

test('case-insensitive email migration is additive and versioned', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const migration = fs.readFileSync(
    path.join(__dirname, '../migrations/001_case_insensitive_user_email.sql'),
    'utf8'
  );
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower/i);
  assert.match(migration, /LOWER\(BTRIM\(email\)\)/i);
  assert.doesNotMatch(migration, /\b(DROP|DELETE|TRUNCATE)\b/i);
});

test('super-admin creation assigns the role in a locked transaction without returning credentials', async () => {
  const statements = [];
  let insertedRole;
  let storedPasswordHash;
  process.env.SUPER_ADMIN_EMAIL = 'owner@example.test';
  clientHandler = async () => ({
    async query(sql, params = []) {
      statements.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [] };
      if (/SELECT COUNT\(\*\)::int AS count/i.test(sql)) return { rows: [{ count: 1 }] };
      if (/INSERT INTO users/i.test(sql)) {
        insertedRole = params[4];
        storedPasswordHash = params[3];
        return {
          rows: [{
            id: 45,
            username: params[0],
            email: params[1],
            phone: params[2],
            role: params[4],
            status: 'active',
            created_at: '2026-11-10T12:00:00.000Z'
          }]
        };
      }
      if (/INSERT INTO audit_logs/i.test(sql)) return { rows: [] };
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    release() {}
  });

  const res = response();
  await AuthController.createSuperAdmin({
    body: {
      username: 'second.admin',
      email: 'Second.Admin@example.test',
      password: 'a-different-secure-password-123',
      confirmPassword: 'a-different-secure-password-123'
    },
    user: { id: 1 },
    ip: '127.0.0.1'
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(insertedRole, 'super_admin');
  assert.equal(res.body.data.user.email, 'second.admin@example.test');
  assert.equal(res.body.data.user.role, 'super_admin');
  assert.equal(res.body.data.tokens, undefined);
  assert.equal(await bcrypt.compare('a-different-secure-password-123', storedPasswordHash), true);
  assert.equal(statements[0], 'BEGIN');
  assert.match(statements[1], /pg_advisory_xact_lock/i);
  assert.equal(statements.at(-1), 'COMMIT');
});

test('super-admin creation enforces the five-account cap under the advisory lock', async () => {
  const statements = [];
  clientHandler = async () => ({
    async query(sql) {
      statements.push(sql);
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [] };
      if (/SELECT COUNT\(\*\)::int AS count/i.test(sql)) return { rows: [{ count: 5 }] };
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    release() {}
  });

  const res = response();
  await AuthController.createSuperAdmin({
    body: {
      username: 'sixth.admin',
      email: 'sixth.admin@example.test',
      password: 'another-different-secure-password-123',
      confirmPassword: 'another-different-secure-password-123'
    },
    user: { id: 1 },
    ip: '127.0.0.1'
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, 'The system is limited to five super administrators');
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements[1], 'SELECT pg_advisory_xact_lock($1)');
  assert.match(statements[2], /SELECT COUNT\(\*\)::int AS count/i);
  assert.equal(statements[3], 'ROLLBACK');
  assert.equal(statements.length, 4);
});

test('existing admin promotion preserves credentials and records the role change', async () => {
  const statements = [];
  let updatedRole;
  clientHandler = async () => ({
    async query(sql, params = []) {
      statements.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [] };
      if (/SELECT id, username, email, role, status, created_at/i.test(sql)) {
        return {
          rows: [{
            id: 45,
            username: 'gideon.akussah',
            email: 'gideon.akussah1234@gmail.com',
            role: 'admin',
            status: 'active'
          }]
        };
      }
      if (/SELECT COUNT\(\*\)::int AS count/i.test(sql)) return { rows: [{ count: 1 }] };
      if (/UPDATE users/i.test(sql)) {
        updatedRole = /SET role = 'super_admin'/i.test(sql);
        return {
          rows: [{
            id: 45,
            username: 'gideon.akussah',
            email: 'gideon.akussah1234@gmail.com',
            role: 'super_admin',
            status: 'active'
          }]
        };
      }
      if (/INSERT INTO audit_logs/i.test(sql)) return { rows: [] };
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    release() {}
  });

  const res = response();
  await AuthController.promoteSuperAdmin({
    body: { email: 'Gideon.Akussah1234@gmail.com ' },
    user: { id: 1 },
    ip: '127.0.0.1'
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updatedRole, true);
  assert.equal(res.body.data.user.role, 'super_admin');
  assert.match(res.body.message, /promoted/i);
  assert.ok(statements.some(sql => /INSERT INTO audit_logs/i.test(sql)));
  assert.equal(statements.at(-1), 'COMMIT');
});

test('existing admin promotion enforces the five-account cap', async () => {
  const statements = [];
  clientHandler = async () => ({
    async query(sql) {
      statements.push(sql);
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [] };
      if (/SELECT id, username, email, role, status, created_at/i.test(sql)) {
        return {
          rows: [{
            id: 45,
            username: 'sixth.admin',
            email: 'sixth.admin@example.test',
            role: 'admin',
            status: 'active'
          }]
        };
      }
      if (/SELECT COUNT\(\*\)::int AS count/i.test(sql)) return { rows: [{ count: 5 }] };
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    release() {}
  });

  const res = response();
  await AuthController.promoteSuperAdmin({
    body: { email: 'sixth.admin@example.test' },
    user: { id: 1 },
    ip: '127.0.0.1'
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, 'The system is limited to five super administrators');
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.some(sql => /UPDATE users/i.test(sql)), false);
});

test('super-admin role migration preserves existing roles and adds only the new role', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const migration = fs.readFileSync(
    path.join(__dirname, '../migrations/003_super_admin_role.sql'),
    'utf8'
  );
  assert.match(migration, /CHECK\s*\(role IN \('admin', 'super_admin', 'parent', 'student', 'vendor'\)\)/i);
  assert.doesNotMatch(migration, /\b(DELETE|TRUNCATE)\b/i);
});

test.after(async () => {
  await database.pool.end();
});
