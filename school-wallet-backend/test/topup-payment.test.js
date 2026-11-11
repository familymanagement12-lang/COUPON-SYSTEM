const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';

const database = require('../src/config/database');
const TopUpService = require('../src/services/TopUpService');

test('production payment callback falls back from localhost to the deployed frontend', () => {
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://coupons.example.test';
  process.env.PAYMENT_RETURN_URL = 'http://localhost:5173/topup';
  assert.equal(TopUpService.getPaymentCallbackUrl(), 'https://coupons.example.test/topup');
});

test('production payment callback preserves a secure configured frontend URL', () => {
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://coupons.example.test';
  process.env.PAYMENT_RETURN_URL = 'https://coupons.example.test/topup?source=paystack';
  assert.equal(TopUpService.getPaymentCallbackUrl(), 'https://coupons.example.test/topup?source=paystack');
});

test('failed top-up marks both records failed in one transaction', async () => {
  const statements = [];
  const originalConnect = database.pool.connect;
  let released = false;
  database.pool.connect = async () => ({
    async query(sql) {
      statements.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (/SELECT pt\.id, pt\.wallet_transaction_id/i.test(sql)) {
        return { rows: [{ id: 8, wallet_transaction_id: 17, status: 'pending', wallet_transaction_status: 'pending' }] };
      }
      return { rows: [], rowCount: 1 };
    },
    release() { released = true; }
  });

  try {
    const result = await TopUpService.failTopUp('TXN-test', 'Paystack payment failed');
    assert.equal(result.status, 'failed');
    assert.equal(statements.some(sql => /UPDATE payment_transactions/i.test(sql)), true);
    assert.equal(statements.some(sql => /UPDATE wallet_transactions/i.test(sql)), true);
    assert.equal(statements.some(sql => /INSERT INTO audit_logs/i.test(sql)), true);
    assert.equal(statements.at(-1), 'COMMIT');
    assert.equal(released, true);
  } finally {
    database.pool.connect = originalConnect;
  }
});

test('late failed top-up response never downgrades a completed payment', async () => {
  const statements = [];
  const originalConnect = database.pool.connect;
  database.pool.connect = async () => ({
    async query(sql) {
      statements.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (/SELECT pt\.id, pt\.wallet_transaction_id/i.test(sql)) {
        return { rows: [{ id: 8, wallet_transaction_id: 17, status: 'completed', wallet_transaction_status: 'completed' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {}
  });

  try {
    const result = await TopUpService.failTopUp('TXN-test', 'late failure callback');
    assert.equal(result.status, 'completed');
    assert.equal(statements.some(sql => /UPDATE payment_transactions|UPDATE wallet_transactions|INSERT INTO audit_logs/i.test(sql)), false);
    assert.equal(statements.at(-1), 'COMMIT');
  } finally {
    database.pool.connect = originalConnect;
  }
});

test.after(async () => {
  await database.pool.end();
});