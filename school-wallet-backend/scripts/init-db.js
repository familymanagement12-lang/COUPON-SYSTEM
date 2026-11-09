#!/usr/bin/env node

/**
 * Database Initialization Script
 * Run this script to initialize the database schema
 * 
 * Usage: node scripts/init-db.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { pool } = require('../src/config/database');

const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing database schema...');
    
    // Read migration file
    const migrationPath = path.join(__dirname, '../src/config/migrations.sql');
    const sqlQueries = fs.readFileSync(migrationPath, 'utf8');
    
    // Split queries by semicolon and filter empty ones
    const queries = sqlQueries.split(';').filter(query => query.trim().length > 0);
    
    console.log(`📝 Found ${queries.length} SQL queries to execute`);
    
    // Execute each query
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i].trim();
      if (query.length === 0) continue;
      
      try {
        await pool.query(query);
        console.log(`✅ Query ${i + 1}/${queries.length} executed successfully`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`ℹ️  Query ${i + 1}: Table already exists (skipping)`);
        } else {
          console.error(`❌ Query ${i + 1} failed:`, error.message);
          throw error;
        }
      }
    }
    
    console.log('✅ Database initialization completed successfully!');
    console.log('📊 All tables and indexes have been created.');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    process.exit(1);
  }
};

// Check database connection first
const checkConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Please check your .env file and PostgreSQL settings');
    process.exit(1);
  }
};

// Run initialization
(async () => {
  await checkConnection();
  await initializeDatabase();
})();
