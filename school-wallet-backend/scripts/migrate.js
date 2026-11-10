#!/usr/bin/env node

require('dotenv').config({ path: ['.env.local', '.env'] });
const { createMigrationPool, runMigrations, sanitizeErrorMessage } = require('../src/config/migrations');

async function main() {
  let pool;
  try {
    pool = createMigrationPool();
    await runMigrations(pool);
    console.log('Database migrations completed.');
  } catch (error) {
    if (!pool) {
      console.error(`Could not start database migration: ${sanitizeErrorMessage(error)}`);
    } else {
      console.error('Database migration command failed; the migration error is logged above.');
    }
    process.exitCode = 1;
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch (error) {
        console.error(`Could not close migration database pool: ${sanitizeErrorMessage(error)}`);
        process.exitCode = 1;
      }
    }
  }
}

main();
