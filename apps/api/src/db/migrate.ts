import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Pool } = pkg;
import { env } from '../config/env.js';
import { getPool, closeDbConnection } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(customPool?: pkg.Pool): Promise<void> {
  const ownPool = !customPool && env.ADMIN_DATABASE_URL ? new Pool({ connectionString: env.ADMIN_DATABASE_URL }) : null;
  const pool = customPool || ownPool || getPool();
  const client = await pool.connect();

  try {
    console.log('🔄 Running database migrations...');

    // Tracks applied migrations in a dedicated table so each script runs exactly once
    // Table: _migrations (id SERIAL PRIMARY KEY, name TEXT UNIQUE, applied_at TIMESTAMPTZ)
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    let migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      // Fallback for compiled dist/ location: check src/db/migrations
      const srcFallback = path.resolve(__dirname, '../../src/db/migrations');
      if (fs.existsSync(srcFallback)) {
        migrationsDir = srcFallback;
      }
    }

    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found.');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const alreadyApplied = await client.query(
        'SELECT id FROM _migrations WHERE name = $1',
        [file]
      );

      if (alreadyApplied.rows.length > 0) {
        console.log(`  ⏭️  Skipping already applied migration: ${file}`);
        continue;
      }

      console.log(`  ▶️  Applying migration: ${file}`);
      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✅ Applied migration: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Failed applying migration: ${file}`, err);
        throw err;
      }
    }

    // Configure ptw_app_user password from environment variable if provided
    if (process.env.APP_DB_PASSWORD) {
      try {
        const escaped = process.env.APP_DB_PASSWORD.replace(/'/g, "''");
        await client.query(`ALTER ROLE ptw_app_user WITH PASSWORD '${escaped}';`);
        console.log('  🔑 Configured ptw_app_user password from APP_DB_PASSWORD');
      } catch {
        console.log('  ℹ️  Connection lacks permission to ALTER ROLE ptw_app_user (assumed provisioned by DBA).');
      }
    }

    console.log('✨ All migrations completed successfully.');
  } finally {
    client.release();
    if (ownPool) {
      await ownPool.end();
    }
  }
}

// If invoked directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => closeDbConnection())
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
