const { Pool } = require('pg');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const { getRequestId } = require('../utils/requestContext');
require('dotenv').config({ path: ['.env.local', '.env'] });

const databasePoolConfig = (env = process.env) => {
  const connectionString = env.DATABASE_URL || env.DATABASE_URL_UNPOOLED;
  const connectionSsl = env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

  return connectionString
    ? {
      connectionString,
      ...(env.DB_SSL === 'true' ? { ssl: connectionSsl } : {}),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }
    : {
      user: env.DB_USER || 'postgres',
      host: env.DB_HOST || 'localhost',
      database: env.DB_NAME || 'school_wallet_db',
      password: env.DB_PASSWORD,
      port: Number(env.DB_PORT || 5432),
      ssl: connectionSsl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
};

const pool = new Pool(databasePoolConfig());
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message);
});

const SLOW_QUERY_THRESHOLD_MS = 500;

const queryFingerprint = (text) => crypto
  .createHash('sha1')
  .update(String(text).replace(/\s+/g, ' ').trim())
  .digest('hex')
  .slice(0, 12);

const logSlowQuery = (fingerprint, durationMs, rows) => {
  if (durationMs < SLOW_QUERY_THRESHOLD_MS) return;
  console.warn('[db] slow query', JSON.stringify({
    requestId: getRequestId(),
    fingerprint,
    durationMs,
    rows,
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    }
  }));
};

const logQueryFailure = (fingerprint, durationMs, error) => {
  console.error('[db] query failed', JSON.stringify({
    requestId: getRequestId(),
    fingerprint,
    durationMs,
    code: error.code
  }));
};

const query = async (text, params) => {
  const startedAt = performance.now();
  const fingerprint = queryFingerprint(text);
  try {
    const result = await pool.query(text, params);
    const durationMs = Math.round(performance.now() - startedAt);
    logSlowQuery(fingerprint, durationMs, result.rowCount);
    return result;
  } catch (error) {
    logQueryFailure(fingerprint, Math.round(performance.now() - startedAt), error);
    throw error;
  }
};

const getClient = async () => {
  const startedAt = performance.now();
  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    console.error('[db] connection checkout failed', JSON.stringify({
      requestId: getRequestId(),
      waitMs: Math.round(performance.now() - startedAt),
      code: error.code
    }));
    throw error;
  }
  const waitMs = Math.round(performance.now() - startedAt);
  if (waitMs >= SLOW_QUERY_THRESHOLD_MS) {
    console.warn('[db] slow connection checkout', JSON.stringify({
      requestId: getRequestId(),
      waitMs,
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      }
    }));
  }

  const originalQuery = client.query.bind(client);
  client.query = (text, params) => {
    const queryStartedAt = performance.now();
    const fingerprint = queryFingerprint(text);
    return originalQuery(text, params).then(
      result => {
        logSlowQuery(fingerprint, Math.round(performance.now() - queryStartedAt), result.rowCount);
        return result;
      },
      error => {
        logQueryFailure(fingerprint, Math.round(performance.now() - queryStartedAt), error);
        throw error;
      }
    );
  };
  return client;
};

module.exports = { pool, query, getClient, databasePoolConfig };
