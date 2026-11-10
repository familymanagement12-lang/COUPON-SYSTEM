const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIRECTORY = path.join(__dirname, '../../migrations');
const MIGRATION_LOCK_ID = 73402911;

const migrationPoolConfig = (env = process.env) => {
  const connectionString = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  const ssl = env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

  if (connectionString) {
    return {
      connectionString,
      ...(env.DB_SSL === 'true' ? { ssl } : {}),
      max: 1,
      connectionTimeoutMillis: 10000
    };
  }

  if (env.DB_HOST && env.DB_NAME && env.DB_USER && env.DB_PASSWORD) {
    return {
      user: env.DB_USER,
      host: env.DB_HOST,
      database: env.DB_NAME,
      password: env.DB_PASSWORD,
      port: Number(env.DB_PORT || 5432),
      ssl,
      max: 1,
      connectionTimeoutMillis: 10000
    };
  }

  throw new Error('Set DATABASE_URL_UNPOOLED, DATABASE_URL, or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD before running migrations.');
};

const createMigrationPool = (env = process.env, PoolConstructor = Pool) => (
  new PoolConstructor(migrationPoolConfig(env))
);

const sanitizeErrorMessage = (error, env = process.env) => {
  let message = error?.message || String(error);
  const secrets = [
    env.DATABASE_URL_UNPOOLED,
    env.DATABASE_URL,
    env.DB_PASSWORD
  ].filter(Boolean);

  secrets.forEach(secret => {
    message = message.split(secret).join('[REDACTED]');
  });
  return message.replace(
    /(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+@/gi,
    '$1[REDACTED]@'
  );
};

const migrationFiles = (directory = MIGRATIONS_DIRECTORY) => fs.readdirSync(directory)
  .filter(name => /^\d+.*\.sql$/.test(name))
  .sort();

async function runMigrations(pool, {
  directory = MIGRATIONS_DIRECTORY,
  logger = console,
  env = process.env
} = {}) {
  let client;
  let currentMigration = 'migration setup';

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const appliedResult = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(appliedResult.rows.map(row => row.name));

    for (const name of migrationFiles(directory)) {
      if (applied.has(name)) continue;
      currentMigration = name;
      const sql = fs.readFileSync(path.join(directory, name), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      logger.info(`[migration] applied ${name}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    const message = sanitizeErrorMessage(error, env);
    if (error.code === '23505') {
      logger.error(
        `[migration] failed at ${currentMigration} (code ${error.code}): ${message}. ` +
        'Duplicate email addresses normalize to the same value after trimming and lowercasing; ' +
        'review those accounts and retry. No account data was deleted.'
      );
    } else {
      logger.error(`[migration] failed at ${currentMigration} (code ${error.code || 'unknown'}): ${message}`);
    }
    throw error;
  } finally {
    client?.release();
  }
}

module.exports = {
  MIGRATION_LOCK_ID,
  createMigrationPool,
  migrationFiles,
  migrationPoolConfig,
  runMigrations,
  sanitizeErrorMessage
};
