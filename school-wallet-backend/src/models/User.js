const { query } = require('../config/database');
const bcrypt = require('bcrypt');

class User {
  static async create(userData) {
    const { username, email, phone, password, role } = userData;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await query(
      `INSERT INTO users (username, email, phone, password_hash, role, status) 
       VALUES ($1, $2, $3, $4, $5, 'active') 
       RETURNING id, username, email, phone, role, status, created_at`,
      [username, email, phone, hashedPassword, role]
    );
    
    return result.rows[0];
  }

  static async findById(id) {
    const result = await query(
      `SELECT id, username, email, phone, role, status, created_at, updated_at 
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );
    return result.rows[0];
  }

  static async findByUsername(username) {
    const result = await query(
      `SELECT * FROM users WHERE username = $1`,
      [username]
    );
    return result.rows[0];
  }

  static async findByPhone(phone) {
    const result = await query(
      `SELECT * FROM users WHERE phone = $1`,
      [phone]
    );
    return result.rows[0];
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async updatePassword(userId, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const result = await query(
      `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 RETURNING id, email, updated_at`,
      [hashedPassword, userId]
    );
    
    return result.rows[0];
  }

  static async update(userId, updateData) {
    const allowedFields = ['username', 'email', 'phone', 'status'];
    const fields = Object.keys(updateData).filter(key => allowedFields.includes(key));
    
    if (fields.length === 0) return null;
    
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = [...fields.map(field => updateData[field]), userId];
    
    const result = await query(
      `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${fields.length + 1} 
       RETURNING id, username, email, phone, role, status, updated_at`,
      values
    );
    
    return result.rows[0];
  }

  static async delete(userId) {
    const result = await query(
      `UPDATE users SET status = 'deleted' WHERE id = $1 RETURNING id, status`,
      [userId]
    );
    return result.rows[0];
  }

  static async findByRole(role) {
    const result = await query(
      `SELECT id, username, email, phone, role, status, created_at 
       FROM users WHERE role = $1 AND status != 'deleted'`,
      [role]
    );
    return result.rows;
  }
}

module.exports = User;
