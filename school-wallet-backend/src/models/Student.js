const { query } = require('../config/database');
const QRCode = require('qrcode');

class Student {
  static async generateStudentId(db = { query }) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const numericPart = String(Math.floor(Math.random() * 10000000)).padStart(7, '0');
      const studentId = `STU${numericPart}`;
      const existing = await db.query(
        `SELECT 1 FROM students WHERE student_id = $1 LIMIT 1`,
        [studentId]
      );

      if (existing.rows.length === 0) return studentId;
    }

    throw new Error('Unable to generate a unique student ID');
  }

  static async create(studentData) {
    const { userId, firstName, lastName, studentId, className, dateOfBirth } = studentData;
    
    // Generate QR code data
    const qrCodeData = await QRCode.toDataURL(studentId);
    
    const result = await query(
      `INSERT INTO students (user_id, student_id, first_name, last_name, class, date_of_birth, qr_code_data, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') 
       RETURNING id, user_id, student_id, first_name, last_name, class, qr_code_data, status, created_at`,
      [userId, studentId, firstName, lastName, className, dateOfBirth, qrCodeData]
    );
    
    return result.rows[0];
  }

  static async findById(id) {
    const result = await query(
      `SELECT s.*, u.email, u.phone, u.status as user_status 
       FROM students s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByStudentId(studentId) {
    const normalizedStudentId = String(studentId || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const result = await query(
      `SELECT s.*, u.email, u.phone, u.status as user_status 
       FROM students s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.student_id = $1
          OR LOWER(REGEXP_REPLACE(s.student_id, '[^a-zA-Z0-9]', '', 'g')) = $2`,
      [studentId, normalizedStudentId]
    );
    return result.rows[0];
  }

  static async lookupByStudentId(studentId) {
    const normalizedStudentId = String(studentId || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const result = await query(
      `SELECT s.id, s.student_id, s.first_name, s.last_name, s.class, s.status,
              w.status AS wallet_status
       FROM students s
       LEFT JOIN wallets w ON w.student_id = s.id
       WHERE LOWER(REGEXP_REPLACE(s.student_id, '[^a-zA-Z0-9]', '', 'g')) = $1
       LIMIT 1`,
      [normalizedStudentId]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await query(
      `SELECT s.*, u.email, u.phone, u.status as user_status 
       FROM students s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  static async update(studentId, updateData) {
    const allowedFields = ['first_name', 'last_name', 'class', 'status'];
    const fields = Object.keys(updateData).filter(key => allowedFields.includes(key));
    
    if (fields.length === 0) return null;
    
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = [...fields.map(field => updateData[field]), studentId];
    
    const result = await query(
      `UPDATE students SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${fields.length + 1} 
       RETURNING id, student_id, first_name, last_name, class, status, updated_at`,
      values
    );
    
    return result.rows[0];
  }

  static async assignParent(studentId, parentId) {
    const result = await query(
      `INSERT INTO student_parents (student_id, parent_id)
       VALUES ($1, $2)
       ON CONFLICT (student_id, parent_id) DO NOTHING
       RETURNING id, student_id, parent_id, created_at`,
      [studentId, parentId]
    );

    if (result.rows[0]) return result.rows[0];

    const existing = await query(
      `SELECT id, student_id, parent_id, created_at
       FROM student_parents
       WHERE student_id = $1 AND parent_id = $2`,
      [studentId, parentId]
    );
    return existing.rows[0];
  }

  static async getParents(studentId) {
    const result = await query(
      `SELECT p.id, p.first_name, p.last_name, u.email, u.phone 
       FROM parents p 
       JOIN student_parents sp ON p.id = sp.parent_id 
       JOIN users u ON p.user_id = u.id 
       WHERE sp.student_id = $1`,
      [studentId]
    );
    return result.rows;
  }

  static async suspendStudent(studentId) {
    const result = await query(
      `UPDATE students SET status = 'suspended', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING id, status, updated_at`,
      [studentId]
    );
    return result.rows[0];
  }

  static async activateStudent(studentId) {
    const result = await query(
      `UPDATE students SET status = 'active', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING id, status, updated_at`,
      [studentId]
    );
    return result.rows[0];
  }

  static async getQRCode(studentId) {
    const result = await query(
      `SELECT qr_code_data FROM students WHERE student_id = $1`,
      [studentId]
    );
    return result.rows[0]?.qr_code_data;
  }
}

module.exports = Student;
