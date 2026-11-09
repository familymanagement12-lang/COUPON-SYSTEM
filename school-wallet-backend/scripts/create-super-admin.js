#!/usr/bin/env node

require('dotenv').config({ path: ['.env.local', '.env'] });
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/database');

const email = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD || '';

async function createSuperAdmin() {
  if (!email || !password) {
    throw new Error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD before running this script');
  }
  if (password.length < 12) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 12 characters');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, role, status)
     VALUES ($1, $2, $3, 'admin', 'active')
     ON CONFLICT (email) DO UPDATE
     SET username = EXCLUDED.username,
         password_hash = EXCLUDED.password_hash,
         role = 'admin',
         status = 'active',
         updated_at = CURRENT_TIMESTAMP
     RETURNING id, username, email, role, status`,
    [email, email, passwordHash]
  );

  console.log(`Super admin ready: ${result.rows[0].email}`);
}

createSuperAdmin()
  .catch((error) => {
    console.error('Failed to create super admin:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());