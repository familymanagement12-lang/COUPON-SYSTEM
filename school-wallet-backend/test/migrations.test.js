const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:secret@127.0.0.1:1/test';

const app = require('../index');
const {
  MIGRATION_LOCK_ID,
  migrationPoolConfig,
  runMigrations
} = require('../src/config/migrations');

function createMigrationDirectory(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'school-wallet-migrations-'));
  files.forEach(([name, sql]) => fs.writeFileSync(path.join(directory, name), sql));
  return directory;
}

function createFakePool({ failingSql } = {}) {
  const applied = new Set();
  const executedMigrations = [];
  const statements = [];
  let pending = [];
  let lockAcquired = false;
  let releases = 0;

  const client = {
    async query(sql, params = []) {
      statements.push(sql);
      if (sql === 'BEGIN') {
        pending = [];
        return { rows: [] };
      }
      if (/pg_advisory_xact_lock/i.test(sql)) {
        assert.deepEqual(params, [MIGRATION_LOCK_ID]);
        lockAcquired = true;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(sql)) return { rows: [] };
      if (sql === 'SELECT name FROM schema_migrations') {
        assert.equal(lockAcquired, true);
        return { rows: [...applied].map(name => ({ name })) };
      }
      if (/^INSERT INTO schema_migrations/i.test(sql)) {
        pending.push(params[0]);
        return { rows: [] };
      }
      if (sql === 'COMMIT') {
        pending.forEach(name => applied.add(name));
        pending = [];
        lockAcquired = false;
        return { rows: [] };
      }
      if (sql === 'ROLLBACK') {
        pending = [];
        lockAcquired = false;
        return { rows: [] };
      }
      if (sql === failingSql) {
        const error = new Error('injected migration failure');
        error.code = 'XX000';
        throw error;
      }
      executedMigrations.push(sql);
      return { rows: [] };
    },
    release() {
      releases += 1;
    }
  };

  return {
    applied,
    executedMigrations,
    statements,
    get releases() {
      return releases;
    },
    async connect() {
      return client;
    }
  };
}

test('migration runner records versions and skips every completed migration on rerun', async t => {
  const directory = createMigrationDirectory([
    ['001_one.sql', 'SELECT 1;'],
    ['002_two.sql', 'SELECT 2;']
  ]);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const pool = createFakePool();
  const logs = [];
  const logger = { info: message => logs.push(message), error: message => logs.push(message) };

  await runMigrations(pool, { directory, logger });
  assert.deepEqual([...pool.applied], ['001_one.sql', '002_two.sql']);
  assert.deepEqual(pool.executedMigrations, ['SELECT 1;', 'SELECT 2;']);
  assert.match(pool.statements[1], /pg_advisory_xact_lock/i);

  await runMigrations(pool, { directory, logger });
  assert.deepEqual(pool.executedMigrations, ['SELECT 1;', 'SELECT 2;']);
  assert.equal(pool.statements.filter(sql => sql === 'COMMIT').length, 2);
  assert.equal(pool.releases, 2);
});

test('migration runner rolls back a failed migration, logs its SQL error, and does not record it', async t => {
  const directory = createMigrationDirectory([['003_fails.sql', 'SELECT fail;']]);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const pool = createFakePool({ failingSql: 'SELECT fail;' });
  const errors = [];
  const logger = { info() {}, error: message => errors.push(message) };

  await assert.rejects(runMigrations(pool, { directory, logger }), /injected migration failure/);
  assert.equal(pool.applied.size, 0);
  assert.equal(pool.statements.at(-1), 'ROLLBACK');
  assert.match(errors[0], /003_fails\.sql/);
  assert.match(errors[0], /injected migration failure/);
  assert.equal(pool.releases, 1);
});

test('migration connection prefers direct Neon URL and supports pooled or local PostgreSQL configuration', () => {
  const direct = migrationPoolConfig({
    DATABASE_URL_UNPOOLED: 'postgres://direct.example/db',
    DATABASE_URL: 'postgres://pooled.example/db'
  });
  assert.equal(direct.connectionString, 'postgres://direct.example/db');
  assert.equal(direct.max, 1);

  const pooled = migrationPoolConfig({ DATABASE_URL: 'postgres://pooled.example/db' });
  assert.equal(pooled.connectionString, 'postgres://pooled.example/db');

  const local = migrationPoolConfig({
    DB_HOST: 'localhost',
    DB_NAME: 'school',
    DB_USER: 'postgres',
    DB_PASSWORD: 'local-secret'
  });
  assert.equal(local.host, 'localhost');
  assert.equal(local.database, 'school');
  assert.equal(local.password, 'local-secret');
});

test('backend completes migrations and closes the migration pool before listening', async () => {
  const events = [];
  const logs = [];
  const fakePool = { async end() { events.push('pool-closed'); } };
  const fakeApp = {
    listen(port) {
      events.push(`listen:${port}`);
      return { port };
    }
  };

  const server = await app.startServer({
    serverApp: fakeApp,
    port: 4321,
    migrationPool: fakePool,
    logger: { error: message => logs.push(message) },
    migrationRunner: async pool => {
      assert.equal(pool, fakePool);
      events.push('migrations-complete');
    }
  });

  assert.deepEqual(events, ['migrations-complete', 'pool-closed', 'listen:4321']);
  assert.equal(server.port, 4321);
});

test('backend refuses to listen when migration startup fails', async () => {
  const events = [];
  const fakePool = { async end() { events.push('pool-closed'); } };
  const fakeApp = { listen() { events.push('listen'); } };
  const logs = [];

  await assert.rejects(app.startServer({
    serverApp: fakeApp,
    migrationPool: fakePool,
    logger: { error: message => logs.push(message) },
    migrationRunner: async () => {
      events.push('migration-failed');
      throw new Error('migration blocked');
    }
  }), /migration blocked/);

  assert.deepEqual(events, ['migration-failed', 'pool-closed']);
  assert.deepEqual(logs, ['[startup] migrations failed; HTTP server will not start.']);
});

test.after(async () => {
  await app.get('db').pool.end();
});
