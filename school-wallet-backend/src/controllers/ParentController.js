const Parent = require('../models/Parent');
const Student = require('../models/Student');
const ResponseHandler = require('../utils/response');

const linkStudent = async (req, res) => {
  try {
    const parent = await Parent.findOrCreateByUser(req.user);
    if (!parent) {
      return ResponseHandler.notFound(res, 'Parent profile not found.');
    }

    const requestedStudents = Array.isArray(req.body?.students)
      ? req.body.students
      : [{ studentIdentifier: req.body?.studentIdentifier }];
    if (requestedStudents.length === 0 || requestedStudents.length > 50) {
      return ResponseHandler.badRequest(res, 'Provide between 1 and 50 students.');
    }

    const results = [];
    for (const [index, requestedStudent] of requestedStudents.entries()) {
      const studentIdentifier = String(requestedStudent?.studentIdentifier || '').trim();
      if (!studentIdentifier) {
        results.push({ row: index + 1, status: 'invalid', message: 'Student ID is required.' });
        continue;
      }

      const student = await Student.findByStudentId(studentIdentifier);
      if (!student) {
        results.push({ row: index + 1, studentIdentifier, status: 'not_found', message: 'Student not found.' });
        continue;
      }

      const relationship = await Student.assignParent(student.id, parent.id);
      results.push({
        row: index + 1,
        status: 'linked',
        relationship,
        student: {
          id: student.id,
          student_id: student.student_id,
          studentId: student.student_id,
          first_name: student.first_name,
          firstName: student.first_name,
          last_name: student.last_name,
          lastName: student.last_name
        }
      });
    }

    const linked = results.filter(result => result.status === 'linked');
    if (!Array.isArray(req.body?.students)) {
      const result = results[0];
      if (result.status === 'invalid') return ResponseHandler.badRequest(res, result.message);
      if (result.status === 'not_found') return ResponseHandler.notFound(res, result.message);
      return ResponseHandler.success(res, 'Student linked successfully.', {
        relationship: result.relationship,
        student: result.student
      });
    }

    return ResponseHandler.success(res, 'Student linking completed.', {
      linkedCount: linked.length,
      failedCount: results.length - linked.length,
      students: linked.map(result => result.student),
      results
    });
  } catch (error) {
    console.error('Link student error:', error);
    return ResponseHandler.serverError(res, 'Failed to link student.');
  }
};

const lookupStudent = async (req, res) => {
  const studentIdentifier = String(req.query.studentId || '').trim();
  const normalizedStudentId = studentIdentifier.replace(/[^a-zA-Z0-9]/g, '');
  if (normalizedStudentId.length < 3 || normalizedStudentId.length > 50) {
    return ResponseHandler.badRequest(res, 'Provide a valid student ID.');
  }

  try {
    const student = await Student.lookupByStudentId(studentIdentifier);
    if (!student || student.status !== 'active') {
      return ResponseHandler.notFound(res, 'Student not found.');
    }
    return ResponseHandler.success(res, 'Student found.', {
      student: {
        id: student.id,
        student_id: student.student_id,
        first_name: student.first_name,
        last_name: student.last_name
      }
    });
  } catch (error) {
    console.error('Parent student lookup error:', error.message);
    return ResponseHandler.serverError(res, 'Failed to look up student.');
  }
};

const getChildren = async (req, res) => {
  try {
    const parent = await Parent.findOrCreateByUser(req.user);
    if (!parent) {
      return ResponseHandler.notFound(res, 'Parent profile not found.');
    }

    const students = await Parent.getChildren(parent.id);
    return ResponseHandler.success(res, 'Linked students retrieved successfully.', { students });
  } catch (error) {
    console.error('Get linked students error:', error);
    return ResponseHandler.serverError(res, 'Failed to retrieve linked students.');
  }
};

module.exports = { linkStudent, getChildren, lookupStudent };
