const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://127.0.0.1:1/test';

const database = require('../src/config/database');
const StudentController = require('../src/controllers/StudentController');

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

test('student directory searches by name, ID, class, or email and includes total count', async () => {
  const statements = [];
  queryHandler = async (sql, params = []) => {
    statements.push({ sql, params });
    if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ total_count: 1 }] };
    return { rows: [{ id: 1, student_id: 'STU123', first_name: 'Ama', last_name: 'Mensah' }] };
  };

  const res = response();
  await StudentController.listStudents({ query: { search: 'Ama', limit: '50', offset: '0' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.totalCount, 1);
  assert.equal(res.body.data.search, 'Ama');
  assert.equal(statements.length, 2);
  assert.match(statements.find(({ sql }) => /FROM students s/i.test(sql)).sql, /CONCAT\(s\.first_name, ' ', s\.last_name\) ILIKE \$2/);
  assert.deepEqual(statements.find(({ sql }) => /LIMIT \$3 OFFSET \$4/i.test(sql)).params, ['Ama', '%Ama%', 50, 0]);
});

test('vendor student lookup returns the matched record without exposing unrelated student data', async () => {
  let statement;
  queryHandler = async (sql, params = []) => {
    statement = { sql, params };
    return {
      rows: [{
        id: 4,
        student_id: 'STU00123',
        first_name: 'Ama',
        last_name: 'Mensah',
        class: 'P4',
        status: 'active',
        wallet_status: 'active'
      }]
    };
  };

  const res = response();
  await StudentController.lookupStudent({ query: { studentId: 'stu-00123' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.student.first_name, 'Ama');
  assert.equal(Object.hasOwn(res.body.data.student, 'email'), false);
  assert.deepEqual(statement.params, ['stu00123']);
  assert.match(statement.sql, /LEFT JOIN wallets/);
});

test('student lookup rejects malformed IDs without querying the database', async () => {
  let queried = false;
  queryHandler = async () => {
    queried = true;
    return { rows: [] };
  };

  const res = response();
  await StudentController.lookupStudent({ query: { studentId: '--' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test('student lookup reports an unknown ID as not found', async () => {
  queryHandler = async () => ({ rows: [] });

  const res = response();
  await StudentController.lookupStudent({ query: { studentId: 'STU00001' } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'Student not found.');
});
