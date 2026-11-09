#!/usr/bin/env node

require('dotenv').config();
const { pool } = require('../src/config/database');
const STUDENT_EMAIL_DOMAIN = process.env.STUDENT_EMAIL_DOMAIN || 'mccarthyhillschool.edu.gh';

const createIdentity = (firstName, lastName, studentId) => {
  const nameSlug = `${firstName}-${lastName}`
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const suffix = studentId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toLowerCase();
  const loginName = `${nameSlug}-${suffix}`;
  const emailName = `${firstName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${lastName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${suffix}`;
  return { username: loginName, email: `${emailName}@${STUDENT_EMAIL_DOMAIN}` };
};

async function normalizeStudentLogins() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const students = await client.query(
      `SELECT s.first_name, s.last_name, s.student_id, s.user_id
       FROM students s JOIN users u ON u.id = s.user_id
       WHERE u.role = 'student'`
    );

    for (const student of students.rows) {
      const identity = createIdentity(student.first_name, student.last_name, student.student_id);
      await client.query(
        `UPDATE users SET username = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [identity.username, identity.email, student.user_id]
      );
      console.log(`${student.student_id}: ${identity.username}`);
    }

    await client.query('COMMIT');
    console.log(`Normalized ${students.rows.length} student login(s).`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

normalizeStudentLogins()
  .catch(error => {
    console.error('Failed to normalize student logins:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());