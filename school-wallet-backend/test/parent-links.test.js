const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const Parent = require('../src/models/Parent');
const Student = require('../src/models/Student');
const ParentController = require('../src/controllers/ParentController');

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

test('parent can link multiple students by ID and receive row-level failures', async () => {
  const originalFindOrCreate = Parent.findOrCreateByUser;
  const originalFindByStudentId = Student.findByStudentId;
  const originalAssignParent = Student.assignParent;
  const linked = [];
  const records = new Map([
    ['STU001', { id: 1, student_id: 'STU001', first_name: 'Ama', last_name: 'Mensah' }],
    ['STU002', { id: 2, student_id: 'STU002', first_name: 'Kojo', last_name: 'Mensah' }],
    ['STU003', { id: 3, student_id: 'STU003', first_name: 'Esi', last_name: 'Boateng' }]
  ]);
  Parent.findOrCreateByUser = async user => ({ id: user.id });
  Student.findByStudentId = async studentId => records.get(studentId);
  Student.assignParent = async (studentId, parentId) => {
    linked.push({ studentId, parentId });
    return { id: linked.length, student_id: studentId, parent_id: parentId };
  };

  try {
    const res = response();
    await ParentController.linkStudent({
      user: { id: 7 },
      body: {
        students: [
          { studentIdentifier: 'STU001' },
          { studentIdentifier: 'STU002' },
          { studentIdentifier: 'STU404' },
          { studentIdentifier: 'STU003' }
        ]
      }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.linkedCount, 3);
    assert.equal(res.body.data.failedCount, 1);
    assert.deepEqual(res.body.data.results.map(result => result.status), [
      'linked',
      'linked',
      'not_found',
      'linked'
    ]);
    assert.deepEqual(linked, [
      { studentId: 1, parentId: 7 },
      { studentId: 2, parentId: 7 },
      { studentId: 3, parentId: 7 }
    ]);
  } finally {
    Parent.findOrCreateByUser = originalFindOrCreate;
    Student.findByStudentId = originalFindByStudentId;
    Student.assignParent = originalAssignParent;
  }
});

test('parent single-child linking request remains backward compatible', async () => {
  const originalFindOrCreate = Parent.findOrCreateByUser;
  const originalFindByStudentId = Student.findByStudentId;
  const originalAssignParent = Student.assignParent;
  Parent.findOrCreateByUser = async () => ({ id: 7 });
  Student.findByStudentId = async () => ({
    id: 1,
    student_id: 'STU001',
    first_name: 'Ama',
    last_name: 'Mensah'
  });
  Student.assignParent = async () => ({ id: 4, student_id: 1, parent_id: 7 });

  try {
    const res = response();
    await ParentController.linkStudent({
      user: { id: 7 },
      body: { studentIdentifier: 'STU001' }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.student.student_id, 'STU001');
    assert.equal(res.body.data.relationship.id, 4);
  } finally {
    Parent.findOrCreateByUser = originalFindOrCreate;
    Student.findByStudentId = originalFindByStudentId;
    Student.assignParent = originalAssignParent;
  }
});

test('parent ID lookup returns the matched student name', async () => {
  const originalLookup = Student.lookupByStudentId;
  Student.lookupByStudentId = async studentId => studentId === 'STU001'
    ? { id: 1, student_id: 'STU001', first_name: 'Ama', last_name: 'Mensah', status: 'active' }
    : null;

  try {
    const res = response();
    await ParentController.lookupStudent({ query: { studentId: 'STU001' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.student.first_name, 'Ama');
    assert.equal(res.body.data.student.last_name, 'Mensah');
  } finally {
    Student.lookupByStudentId = originalLookup;
  }
});
