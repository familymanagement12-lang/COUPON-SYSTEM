const { query } = require('../config/database');

class Parent {
  static async create(parentData, client) {
    const { userId, firstName, lastName, relationship } = parentData;
    const execute = client ? client.query.bind(client) : query;
    
    const result = await execute(
      `INSERT INTO parents (user_id, first_name, last_name, relationship) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, user_id, first_name, last_name, relationship, created_at`,
      [userId, firstName, lastName, relationship]
    );
    
    return result.rows[0];
  }

  static async findById(id) {
    const result = await query(
      `SELECT p.*, u.email, u.phone, u.status 
       FROM parents p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await query(
      `SELECT p.*, u.email, u.phone, u.status 
       FROM parents p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  static async findOrCreateByUser(user) {
    const existing = await this.findByUserId(user.id);
    if (existing) return existing;

    const nameParts = String(user.username || user.email || 'Parent')
      .replace(/@.*$/, '')
      .replace(/[._-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const firstName = nameParts[0] || 'Parent';
    const lastName = nameParts.slice(1).join(' ') || 'Guardian';
    return this.create({
      userId: user.id,
      firstName,
      lastName,
      relationship: null
    });
  }

  static async getChildren(parentId) {
    const result = await query(
      `SELECT s.id, s.student_id, s.first_name, s.last_name, s.class, s.status 
       FROM students s 
       JOIN student_parents sp ON s.id = sp.student_id 
       WHERE sp.parent_id = $1`,
      [parentId]
    );
    return result.rows;
  }

  static async update(parentId, updateData) {
    const allowedFields = ['first_name', 'last_name', 'relationship'];
    const fields = Object.keys(updateData).filter(key => allowedFields.includes(key));
    
    if (fields.length === 0) return null;
    
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = [...fields.map(field => updateData[field]), parentId];
    
    const result = await query(
      `UPDATE parents SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${fields.length + 1} 
       RETURNING id, first_name, last_name, relationship, updated_at`,
      values
    );
    
    return result.rows[0];
  }
}

module.exports = Parent;
