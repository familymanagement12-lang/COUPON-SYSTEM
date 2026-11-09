const { Pool } = require('pg');
require('dotenv').config();

// Database connection pool
const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
const pool = new Pool(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'school_wallet_db',
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT || 5432),
      ssl,
    });

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

// Query wrapper with logging
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`✓ Query executed in ${duration}ms`);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

const getClient = () => pool.connect();

module.exports = { pool, query, getClient };
