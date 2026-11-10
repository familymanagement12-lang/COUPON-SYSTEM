const test = require('node:test');
const assert = require('node:assert/strict');
const { databasePoolConfig } = require('../src/config/database');

test('runtime database pool prefers the pooled URL and falls back to the direct URL', () => {
  const pooled = databasePoolConfig({
    DATABASE_URL: 'postgres://pooled.example/db',
    DATABASE_URL_UNPOOLED: 'postgres://direct.example/db'
  });
  const directFallback = databasePoolConfig({
    DATABASE_URL_UNPOOLED: 'postgres://direct.example/db'
  });

  assert.equal(pooled.connectionString, 'postgres://pooled.example/db');
  assert.equal(directFallback.connectionString, 'postgres://direct.example/db');
});

test('runtime database pool retains individual DB settings when URLs are absent', () => {
  const config = databasePoolConfig({
    DB_USER: 'school_user',
    DB_PASSWORD: 'not-a-real-password',
    DB_HOST: 'db.example',
    DB_NAME: 'school',
    DB_PORT: '5433'
  });

  assert.equal(config.user, 'school_user');
  assert.equal(config.password, 'not-a-real-password');
  assert.equal(config.host, 'db.example');
  assert.equal(config.database, 'school');
  assert.equal(config.port, 5433);
});
