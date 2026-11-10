const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://127.0.0.1:1/test';

const database = require('../src/config/database');
const VendorController = require('../src/controllers/VendorController');

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

test('vendor recent transactions include student name, student ID, and stable transaction ID', async () => {
  const statements = [];
  queryHandler = async (sql, params = []) => {
    statements.push({ sql, params });
    if (/SELECT COUNT\(\*\) FROM purchases/i.test(sql)) return { rows: [{ count: '1' }] };
    return {
      rows: [{
        id: 8,
        transaction_id: 'PUR123',
        student_identifier: 'STU00001',
        student_name: 'Ama Mensah'
      }]
    };
  };

  const res = response();
  await VendorController.getTransactions({
    params: { vendorId: '12' },
    query: { limit: '50', offset: '0' },
    user: { id: 5, role: 'vendor', vendorId: 12 }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.transactions[0].student_identifier, 'STU00001');
  assert.equal(res.body.data.transactions[0].student_name, 'Ama Mensah');
  const transactionsQuery = statements.find(({ sql }) => /FROM purchases p/i.test(sql));
  assert.match(transactionsQuery.sql, /wt\.id,/);
  assert.match(transactionsQuery.sql, /s\.student_id AS student_identifier/);
  assert.match(transactionsQuery.sql, /AS student_name/);
  assert.deepEqual(transactionsQuery.params, ['12', '50', '0']);
});
