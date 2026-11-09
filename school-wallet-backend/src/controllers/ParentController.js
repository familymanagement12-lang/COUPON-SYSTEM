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
    const { studentIdentifier, lastName } = req.body;
    const normalizedStudentIdentifier = String(studentIdentifier || '').trim();

    if (!studentIdentifier || !lastName) {
      return ResponseHandler.badRequest(res, 'studentIdentifier and lastName are required.');
    }

    const parent = await Parent.findOrCreateByUser(req.user);
    if (!parent) {
      return ResponseHandler.notFound(res, 'Parent profile not found.');
    }

    const student = await Student.findByStudentId(normalizedStudentIdentifier);
    if (!student) {
      return ResponseHandler.notFound(res, 'Student not found.');
    }

    const providedName = normalizeValue(lastName);
    const storedLastName = normalizeValue(student.last_name);
    const storedFullName = normalizeValue(`${student.first_name} ${student.last_name}`);
    if (providedName !== storedLastName && providedName !== storedFullName) {
      return ResponseHandler.forbidden(res, 'Student details could not be verified.');
    }

    const relationship = await Student.assignParent(student.id, parent.id);
    return ResponseHandler.success(res, 'Student linked successfully.', {
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
