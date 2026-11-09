#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: ['.env.local', '.env'] });
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Set DATABASE_URL_UNPOOLED or DATABASE_URL before running migrations.');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const migrationsDirectory = path.join(__dirname, '../migrations');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [73402911]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const files = fs.readdirSync(migrationsDirectory)
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();
    const appliedResult = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(appliedResult.rows.map((row) => row.name));

    for (const name of files) {
      if (applied.has(name)) continue;
      const sql = fs.readFileSync(path.join(migrationsDirectory, name), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      console.log(`Applied migration: ${name}`);
    }

    await client.query('COMMIT');
    console.log('Database migrations completed.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') {
      console.error('Migration stopped: duplicate email addresses normalize to the same value after trimming and lowercasing. Review those accounts and resolve duplicates before retrying; no account data was deleted.');
    } else {
      console.error('Database migration failed:', error.message);
    }
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(async (error) => {
  console.error('Could not start database migration:', error.message);
  await pool.end();
  process.exitCode = 1;
});
