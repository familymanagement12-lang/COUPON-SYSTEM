const Parent = require('../models/Parent');
const Student = require('../models/Student');
const ResponseHandler = require('../utils/response');

const normalizeValue = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const linkStudent = async (req, res) => {
  try {
    const parent = await Parent.findOrCreateByUser(req.user);
    if (!parent) {
      return ResponseHandler.notFound(res, 'Parent profile not found.');
    }

    const requestedStudents = Array.isArray(req.body?.students)
      ? req.body.students
      : [{ studentIdentifier: req.body?.studentIdentifier, lastName: req.body?.lastName }];
    if (requestedStudents.length === 0 || requestedStudents.length > 50) {
      return ResponseHandler.badRequest(res, 'Provide between 1 and 50 students.');
    }

    const results = [];
    for (const [index, requestedStudent] of requestedStudents.entries()) {
      const studentIdentifier = String(requestedStudent?.studentIdentifier || '').trim();
      const lastName = String(requestedStudent?.lastName || '').trim();
      if (!studentIdentifier || !lastName) {
        results.push({ row: index + 1, status: 'invalid', message: 'Student ID and surname or full name are required.' });
        continue;
      }

      const student = await Student.findByStudentId(studentIdentifier);
      if (!student) {
        results.push({ row: index + 1, studentIdentifier, status: 'not_found', message: 'Student not found.' });
        continue;
      }

      const providedName = normalizeValue(lastName);
      const storedLastName = normalizeValue(student.last_name);
      const storedFullName = normalizeValue(`${student.first_name} ${student.last_name}`);
      if (providedName !== storedLastName && providedName !== storedFullName) {
        results.push({ row: index + 1, studentIdentifier, status: 'not_verified', message: 'Student details could not be verified.' });
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
      if (result.status === 'not_verified') return ResponseHandler.forbidden(res, result.message);
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

module.exports = { linkStudent, getChildren };
