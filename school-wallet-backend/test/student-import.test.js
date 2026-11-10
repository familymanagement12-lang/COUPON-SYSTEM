const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:secret@127.0.0.1:1/test';

const database = require('../src/config/database');
const Student = require('../src/models/Student');
database.pool.end = async () => {};

let clientFactory;
database.getClient = (...args) => clientFactory(...args);
Student.generateStudentId = async () => 'GENERATED-1';

const StudentController = require('../src/controllers/StudentController');

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

function createImportClient({ existingStudentIds = [], existingEmails = [] } = {}) {
  const studentIds = new Set(existingStudentIds);
  const emails = new Set(existingEmails);
  const usernames = new Set();
  const users = [];
  const importedRows = [];
  const savepoints = new Map();
  let transactionSnapshot;
  let nextUserId = 1;
  let nextStudentId = 1;
  const statements = [];

  const client = {
    async query(sql, params = []) {
      statements.push(sql);

      if (sql === 'BEGIN') {
        transactionSnapshot = {
          studentIds: new Set(studentIds),
          emails: new Set(emails),
          usernames: new Set(usernames),
          usersLength: users.length,
          importedRowsLength: importedRows.length,
          nextUserId,
          nextStudentId
        };
        return { rows: [] };
      }
      if (sql === 'COMMIT') return { rows: [] };
      if (sql === 'ROLLBACK') {
        studentIds.clear();
        transactionSnapshot.studentIds.forEach(value => studentIds.add(value));
        emails.clear();
        transactionSnapshot.emails.forEach(value => emails.add(value));
        usernames.clear();
        transactionSnapshot.usernames.forEach(value => usernames.add(value));
        users.length = transactionSnapshot.usersLength;
        importedRows.length = transactionSnapshot.importedRowsLength;
        nextUserId = transactionSnapshot.nextUserId;
        nextStudentId = transactionSnapshot.nextStudentId;
        return { rows: [] };
      }
      const savepointMatch = sql.match(/^SAVEPOINT (student_import_\d+)$/);
      if (savepointMatch) {
        savepoints.set(savepointMatch[1], {
          studentIds: new Set(studentIds),
          emails: new Set(emails),
          usernames: new Set(usernames),
          usersLength: users.length,
          importedRowsLength: importedRows.length,
          nextUserId,
          nextStudentId
        });
        return { rows: [] };
      }

      const rollbackMatch = sql.match(/^ROLLBACK TO SAVEPOINT (student_import_\d+)$/);
      if (rollbackMatch) {
        const snapshot = savepoints.get(rollbackMatch[1]);
        studentIds.clear();
        snapshot.studentIds.forEach(value => studentIds.add(value));
        emails.clear();
        snapshot.emails.forEach(value => emails.add(value));
        usernames.clear();
        snapshot.usernames.forEach(value => usernames.add(value));
        users.length = snapshot.usersLength;
        importedRows.length = snapshot.importedRowsLength;
        nextUserId = snapshot.nextUserId;
        nextStudentId = snapshot.nextStudentId;
        return { rows: [] };
      }

      const releaseMatch = sql.match(/^RELEASE SAVEPOINT (student_import_\d+)$/);
      if (releaseMatch) {
        savepoints.delete(releaseMatch[1]);
        return { rows: [] };
      }

      if (/INSERT INTO users/i.test(sql)) {
        const [username, email] = params;
        if (emails.has(email)) {
          const error = new Error('duplicate user email');
          error.code = '23505';
          error.constraint = 'users_email_key';
          throw error;
        }
        if (usernames.has(username)) {
          const error = new Error('duplicate username');
          error.code = '23505';
          error.constraint = 'users_username_key';
          throw error;
        }
        emails.add(email);
        usernames.add(username);
        const user = { id: nextUserId++, username, email, role: 'student', status: 'active' };
        users.push(user);
        return { rows: [user] };
      }

      if (/INSERT INTO students/i.test(sql)) {
        const studentId = params[1];
        if (studentIds.has(studentId)) {
          const error = new Error('duplicate student ID');
          error.code = '23505';
          error.constraint = 'students_student_id_key';
          throw error;
        }
        studentIds.add(studentId);
        const student = {
          id: nextStudentId++,
          student_id: studentId,
          first_name: params[2],
          last_name: params[3],
          class: params[4],
          date_of_birth: params[5],
          status: 'active'
        };
        importedRows.push(student);
        return { rows: [student] };
      }

      if (/INSERT INTO wallets/i.test(sql)) return { rows: [] };
      throw new Error(`Unexpected database query: ${sql}`);
    },
    release() {}
  };

  return { client, importedRows, statements, users };
}

test('bulk import skips duplicate IDs and emails while committing the remaining rows', async () => {
  const databaseState = createImportClient({
    existingStudentIds: ['STU-DUPLICATE'],
    existingEmails: ['already-used@example.test']
  });
  clientFactory = async () => databaseState.client;

  const res = response();
  await StudentController.importStudents({
    body: {
      students: [
        { studentId: 'STU-ONE', firstName: 'Ama', lastName: 'Mensah' },
        { studentId: 'STU-DUPLICATE', firstName: 'Kofi', lastName: 'Owusu' },
        { studentId: 'STU-THREE', firstName: 'Esi', lastName: 'Boateng', email: 'already-used@example.test' },
        { studentId: 'STU-FOUR', firstName: 'Yaw', lastName: 'Asare' }
      ]
    }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.count, 2);
  assert.equal(res.body.data.duplicateCount, 2);
  assert.deepEqual(res.body.data.duplicates.map(({ row, studentId }) => ({ row, studentId })), [
    { row: 2, studentId: 'STU-DUPLICATE' },
    { row: 3, studentId: 'STU-THREE' }
  ]);
  assert.deepEqual(res.body.data.students.map(student => student.student_id), ['STU-ONE', 'STU-FOUR']);
  assert.equal(databaseState.users.length, 2);
  assert.equal(databaseState.statements.at(-1), 'COMMIT');
  assert.equal(databaseState.statements.filter(sql => /^ROLLBACK TO SAVEPOINT/.test(sql)).length, 2);
});

test('bulk import skips repeated IDs inside the same file and imports other rows', async () => {
  const databaseState = createImportClient();
  clientFactory = async () => databaseState.client;

  const res = response();
  await StudentController.importStudents({
    body: {
      students: [
        { studentId: 'STU-SAME', firstName: 'Ama', lastName: 'Mensah' },
        { studentId: 'STU-SAME', firstName: 'Kofi', lastName: 'Owusu' },
        { studentId: 'STU-OTHER', firstName: 'Esi', lastName: 'Boateng' }
      ]
    }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.count, 2);
  assert.equal(res.body.data.duplicateCount, 1);
  assert.equal(res.body.data.duplicates[0].row, 2);
  assert.equal(res.body.data.duplicates[0].reason, 'Student ID is duplicated in this import.');
  assert.deepEqual(res.body.data.students.map(student => student.student_id), ['STU-SAME', 'STU-OTHER']);
});

test('bulk import still rejects invalid rows and rolls back the batch', async () => {
  const databaseState = createImportClient();
  clientFactory = async () => databaseState.client;

  const res = response();
  await StudentController.importStudents({
    body: {
      students: [
        { studentId: 'STU-ONE', firstName: 'Ama', lastName: 'Mensah' },
        { studentId: 'STU-TWO', firstName: 'Kofi', lastName: '' }
      ]
    }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.data, undefined);
  assert.equal(databaseState.statements.at(-1), 'ROLLBACK');
  assert.equal(databaseState.users.length, 0);
});
