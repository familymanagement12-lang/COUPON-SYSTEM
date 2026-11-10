const bcrypt = require('bcrypt');
const QRCode = require('qrcode');
const { getClient, query } = require('../config/database');
const ResponseHandler = require('../utils/response');
const Student = require('../models/Student');

const createTemporaryPassword = () => `Student${Math.random().toString(36).slice(2, 10)}!`;
const STUDENT_EMAIL_DOMAIN = process.env.STUDENT_EMAIL_DOMAIN || 'mccarthyhillschool.edu.gh';

const createMemorableIdentity = (firstName, lastName, studentId) => {
  const nameSlug = `${firstName}-${lastName}`
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const suffix = studentId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toLowerCase();
  const loginName = `${nameSlug}-${suffix}`;
  return {
    username: loginName,
    email: `${firstName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${lastName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${suffix}@${STUDENT_EMAIL_DOMAIN}`
  };
};

const normalizeDuplicateField = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const createStudentDuplicateKey = (firstName, lastName, className) => [
  firstName,
  lastName,
  className
].map(normalizeDuplicateField).join('\u0000');

const listStudents = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const result = await query(
      `SELECT s.id, s.student_id, s.first_name, s.last_name, s.class, s.date_of_birth, s.status,
              u.username, u.email, w.balance, w.status AS wallet_status
       FROM students s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN wallets w ON w.student_id = s.id
       ORDER BY s.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return ResponseHandler.success(res, 'Students retrieved successfully.', {
      students: result.rows,
      limit,
      offset
    });
  } catch (error) {
    console.error('List students error:', error);
    return ResponseHandler.serverError(res, 'Failed to retrieve students.');
  }
};

const importStudents = async (req, res) => {
  const students = req.body?.students;

  if (!Array.isArray(students) || students.length === 0) {
    return ResponseHandler.badRequest(res, 'students must be a non-empty array.');
  }

  if (students.length > 500) {
    return ResponseHandler.badRequest(res, 'A maximum of 500 students can be imported at once.');
  }

  const client = await getClient();
  const importedStudents = [];
  const duplicates = [];

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [73402913]);

    const existingStudents = await client.query(
      'SELECT first_name, last_name, class FROM students'
    );
    const studentNameClasses = new Set(
      existingStudents.rows.map(student => createStudentDuplicateKey(
        student.first_name,
        student.last_name,
        student.class
      ))
    );

    const studentIds = new Set();
    for (const [index, student] of students.entries()) {
      const firstName = String(student.firstName || '').trim();
      const lastName = String(student.lastName || '').trim();
      const className = String(student.className || student.class || '').trim();

      if (!firstName || !lastName) {
        throw new Error(`Row ${index + 1}: firstName and lastName are required.`);
      }

      const duplicateKey = createStudentDuplicateKey(firstName, lastName, className);
      if (studentNameClasses.has(duplicateKey)) {
        duplicates.push({
          row: index + 1,
          ...(student.studentId ? { studentId: String(student.studentId).trim() } : {}),
          reason: 'A student with the same first name, last name, and class already exists.'
        });
        continue;
      }

      await client.query(`SAVEPOINT student_import_${index}`);
      let studentId = '';
      try {
        studentId = String(student.studentId || await Student.generateStudentId(client)).trim();
        if (studentIds.has(studentId)) {
          await client.query(`ROLLBACK TO SAVEPOINT student_import_${index}`);
          await client.query(`RELEASE SAVEPOINT student_import_${index}`);
          duplicates.push({
            row: index + 1,
            studentId,
            reason: 'Student ID is duplicated in this import.'
          });
          continue;
        }
        studentIds.add(studentId);

        const memorableIdentity = createMemorableIdentity(firstName, lastName, studentId);
        const username = String(student.username || memorableIdentity.username).trim().toLowerCase();
        const email = String(student.email || memorableIdentity.email).trim().toLowerCase();
        const temporaryPassword = student.password || createTemporaryPassword();
        const passwordHash = await bcrypt.hash(temporaryPassword, 10);
        const userResult = await client.query(
          `INSERT INTO users (username, email, password_hash, role, status)
           VALUES ($1, $2, $3, 'student', 'active')
           RETURNING id, username, email, role, status`,
          [username, email, passwordHash]
        );
        const user = userResult.rows[0];
        const qrCodeData = await QRCode.toDataURL(studentId);
        const studentResult = await client.query(
          `INSERT INTO students (user_id, student_id, first_name, last_name, class, date_of_birth, qr_code_data, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
           RETURNING id, student_id, first_name, last_name, class, date_of_birth, status`,
          [user.id, studentId, firstName, lastName, className || null, student.dateOfBirth || null, qrCodeData]
        );
        const importedStudent = studentResult.rows[0];

        await client.query(
          `INSERT INTO wallets (student_id, balance, status)
           VALUES ($1, 0, 'active')`,
          [importedStudent.id]
        );

        importedStudents.push({
          ...importedStudent,
          username: user.username,
          email: user.email,
          temporaryPassword
        });
        studentNameClasses.add(duplicateKey);
        await client.query(`RELEASE SAVEPOINT student_import_${index}`);
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT student_import_${index}`);
        await client.query(`RELEASE SAVEPOINT student_import_${index}`);
        if (error.code !== '23505') throw error;

        duplicates.push({
          row: index + 1,
          ...(studentId ? { studentId } : {}),
          reason: 'Student ID, username, or email already exists.'
        });
      }
    }

    await client.query('COMMIT');
    const message = duplicates.length
      ? 'Students imported; duplicate rows were skipped.'
      : 'Students imported successfully.';
    return ResponseHandler.created(res, message, {
      count: importedStudents.length,
      duplicateCount: duplicates.length,
      duplicates,
      students: importedStudents
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return ResponseHandler.badRequest(res, 'A student ID, username, or email already exists.');
    }
    return ResponseHandler.badRequest(res, error.message);
  } finally {
    client.release();
  }
};

module.exports = { importStudents, listStudents };
