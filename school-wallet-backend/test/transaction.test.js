const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';

const database = require('../src/config/database');
const TransactionController = require('../src/controllers/TransactionController');
const SpendingController = require('../src/controllers/SpendingController');

let queryHandler = async () => ({ rows: [] });
database.pool.query = (...args) => queryHandler(...args);

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

test('admin transaction history batches multiple students into one history query', async () => {
  const statements = [];
  queryHandler = async (sql, params = []) => {
    statements.push({ sql, params });
    if (/FROM wallet_transactions/i.test(sql)) {
      return { rows: [{ id: 8, student_id: 1 }, { id: 9, student_id: 2 }] };
    }
    throw new Error(`Unexpected database query: ${sql}`);
  };

  const res = response();
  await TransactionController.getHistory({
    query: { studentIds: '1,2' },
    user: { id: 1, role: 'admin' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.count, 2);
  assert.match(statements[0].sql, /UNNEST\(\$1::int\[\]\)/);
  assert.deepEqual(statements[0].params, [[1, 2], 50]);
  assert.equal(statements.length, 1);
});

test('parent batch history verifies every requested student before reading transactions', async () => {
  let historyRead = false;
  queryHandler = async (sql) => {
    if (/FROM parents p/i.test(sql)) return { rows: [{ id: 12 }] };
    if (/FROM students s/i.test(sql)) return { rows: [{ id: 1 }, { id: 2 }] };
    if (/FROM wallet_transactions/i.test(sql)) {
      historyRead = true;
      return { rows: [] };
    }
    throw new Error(`Unexpected database query: ${sql}`);
  };

  const res = response();
  await TransactionController.getHistory({
    query: { studentIds: '1,3' },
    user: { id: 7, role: 'parent' }
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(historyRead, false);
});

test('transaction history rejects malformed or oversized student ID lists', async () => {
  let databaseQueried = false;
  queryHandler = async () => {
    databaseQueried = true;
    return { rows: [] };
  };

  const malformed = response();
  await TransactionController.getHistory({
    query: { studentIds: '1,,2' },
    user: { id: 1, role: 'admin' }
  }, malformed);
  assert.equal(malformed.statusCode, 400);

  const oversized = response();
  await TransactionController.getHistory({
    query: { studentIds: Array.from({ length: 101 }, (_, index) => index + 1).join(',') },
    user: { id: 1, role: 'admin' }
  }, oversized);
  assert.equal(oversized.statusCode, 400);
  assert.equal(databaseQueried, false);
});

test('parent batch spending limits authorizes all children and includes defaults', async () => {
  const statements = [];
  queryHandler = async (sql, params = []) => {
    statements.push({ sql, params });
    if (/FROM parents p/i.test(sql)) return { rows: [{ id: 12 }] };
    if (/FROM students s/i.test(sql)) return { rows: [{ id: 1 }, { id: 2 }] };
    if (/FROM spending_limits/i.test(sql)) {
      return { rows: [{ student_id: 1, daily_limit: '20.00', weekly_limit: null }] };
    }
    throw new Error(`Unexpected database query: ${sql}`);
  };

  const res = response();
  await SpendingController.getLimitsBatch({
    query: { studentIds: '1,2' },
    user: { id: 7, role: 'parent' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.limits.length, 2);
  assert.equal(res.body.data.limits[0].daily_limit, '20.00');
  assert.deepEqual(res.body.data.limits[1], {
    student_id: 2,
    daily_limit: null,
    weekly_limit: null
  });
  assert.equal(statements.filter(({ sql }) => /FROM spending_limits/i.test(sql)).length, 1);
});

test('parent batch spending limits rejects an unlinked student before querying limits', async () => {
  let limitsRead = false;
  queryHandler = async (sql) => {
    if (/FROM parents p/i.test(sql)) return { rows: [{ id: 12 }] };
    if (/FROM students s/i.test(sql)) return { rows: [{ id: 1 }] };
    if (/FROM spending_limits/i.test(sql)) {
      limitsRead = true;
      return { rows: [] };
    }
    throw new Error(`Unexpected database query: ${sql}`);
  };

  const res = response();
  await SpendingController.getLimitsBatch({
    query: { studentIds: '1,2' },
    user: { id: 7, role: 'parent' }
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(limitsRead, false);
});

test('spending limit endpoints reject missing or malformed student IDs without querying the database', async () => {
  let databaseQueried = false;
  queryHandler = async () => {
    databaseQueried = true;
    return { rows: [] };
  };

  const res = response();
  await SpendingController.getLimits({
    params: { studentId: 'undefined' },
    user: { id: 1, role: 'admin' }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'studentId must be a positive number');
  assert.equal(databaseQueried, false);
});
