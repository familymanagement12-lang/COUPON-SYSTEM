const { query } = require('../config/database');

class Vendor {
  static async create(vendorData) {
    const { userId, vendorName, vendorType, shopLocation, contactPerson } = vendorData;
    
    const result = await query(
      `INSERT INTO vendors (user_id, vendor_name, vendor_type, shop_location, contact_person, status) 
       VALUES ($1, $2, $3, $4, $5, 'active') 
       RETURNING id, user_id, vendor_name, vendor_type, shop_location, contact_person, status, created_at`,
      [userId, vendorName, vendorType, shopLocation, contactPerson]
    );
    
    return result.rows[0];
  }

  static async findById(id) {
    const result = await query(
      `SELECT v.*, u.email, u.phone, u.status as user_status 
       FROM vendors v 
       JOIN users u ON v.user_id = u.id 
       WHERE v.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await query(
      `SELECT v.*, u.email, u.phone, u.status as user_status 
       FROM vendors v 
       JOIN users u ON v.user_id = u.id 
       WHERE v.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  static async addCategory(vendorId, category, isAllowed = true) {
    const result = await query(
      `INSERT INTO vendor_categories (vendor_id, category, is_allowed) 
       VALUES ($1, $2, $3) 
       RETURNING id, vendor_id, category, is_allowed, created_at`,
      [vendorId, category, isAllowed]
    );
    return result.rows[0];
  }

  static async getCategories(vendorId) {
    const result = await query(
      `SELECT id, category, is_allowed 
       FROM vendor_categories 
       WHERE vendor_id = $1`,
      [vendorId]
    );
    return result.rows;
  }

  static async update(vendorId, updateData) {
    const allowedFields = ['vendor_name', 'shop_location', 'contact_person', 'status'];
    const fields = Object.keys(updateData).filter(key => allowedFields.includes(key));
    
    if (fields.length === 0) return null;
    
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = [...fields.map(field => updateData[field]), vendorId];
    
    const result = await query(
      `UPDATE vendors SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${fields.length + 1} 
       RETURNING id, vendor_name, vendor_type, shop_location, status, updated_at`,
      values
    );
    
    return result.rows[0];
  }

  static async getAllVendors() {
    const result = await query(
      `SELECT v.id, v.vendor_name, v.vendor_type, v.shop_location, v.status, u.email 
       FROM vendors v 
       JOIN users u ON v.user_id = u.id 
       WHERE v.status = 'active'`
    );
    return result.rows;
  }
}

module.exports = Vendor;
