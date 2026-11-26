const pkg = require('pg');
const { Pool } = pkg;
const { pathToFileURL } = require('url');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/ptw_cmms_test';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgres://postgres@localhost:5433/ptw_cmms';

async function resetDb(dbName) {
  const adminPool = new Pool({ connectionString: 'postgres://postgres@localhost:5433/postgres' });
  console.log(`Terminating active connections to ${dbName}...`);
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName]
  );
  console.log(`Dropping database ${dbName}...`);
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  console.log(`Re-creating database ${dbName}...`);
  await adminPool.query(`CREATE DATABASE ${dbName}`);
  await adminPool.end();
}

async function runReset() {
  console.log('🔄 Resetting development and test databases on PostgreSQL...');
  await resetDb('ptw_cmms');
  await resetDb('ptw_cmms_test');
  console.log('✅ Databases successfully dropped and recreated.');
}

runReset().catch((err) => {
  console.error('❌ Reset failed:', err);
  process.exit(1);
});
