import pkg from 'pg';
const { Pool } = pkg;
import { runMigrations } from '../apps/api/src/db/migrate.js';
import { seedDatabase } from '../apps/api/src/db/seed.js';

async function migrateAndSeed(dbUrl, dbName) {
  console.log(`\n======================================================`);
  console.log(`Processing ${dbName}...`);
  console.log(`======================================================`);
  const pool = new Pool({ connectionString: dbUrl });

  console.log(`Running migrations on ${dbName}...`);
  await runMigrations(pool);

  console.log(`Running seed on ${dbName}...`);
  await seedDatabase(pool);

  const plantsRes = await pool.query('SELECT count(*) AS count FROM plants');
  const areasRes = await pool.query('SELECT count(*) AS count FROM areas');
  const eqRes = await pool.query('SELECT count(*) AS count FROM equipment');
  const usersRes = await pool.query('SELECT count(*) AS count FROM users');
  const permitsRes = await pool.query('SELECT count(*) AS count FROM permits');

  console.log(`\n📊 Verified Row Counts for ${dbName}:`);
  console.log(`  Plants:    ${plantsRes.rows[0].count}`);
  console.log(`  Areas:     ${areasRes.rows[0].count}`);
  console.log(`  Equipment: ${eqRes.rows[0].count}`);
  console.log(`  Users:     ${usersRes.rows[0].count}`);
  console.log(`  Permits:   ${permitsRes.rows[0].count}`);

  // Display plant and area codes
  const plantsList = await pool.query('SELECT code, name, address FROM plants ORDER BY code ASC');
  console.log('\n🏭 Seeded Plants:');
  for (const p of plantsList.rows) {
    console.log(`  - [${p.code}] ${p.name} (${p.address})`);
  }

  const areasList = await pool.query(`
    SELECT a.code AS "areaCode", a.name AS "areaName", p.code AS "plantCode", u.name AS "ownerName", u.email AS "ownerEmail"
    FROM areas a
    JOIN plants p ON p.id = a.plant_id
    JOIN users u ON u.id = a.owner_id
    ORDER BY p.code, a.code
  `);
  console.log('\n📍 Seeded Areas & Assigned Owners:');
  for (const a of areasList.rows) {
    console.log(`  - [${a.plantCode} / ${a.areaCode}] ${a.areaName} -> Assigned Owner: ${a.ownerName} (${a.ownerEmail})`);
  }

  await pool.end();
}

async function main() {
  await migrateAndSeed('postgres://postgres@localhost:5433/ptw_cmms', 'ptw_cmms (Dev DB)');
  await migrateAndSeed('postgres://postgres@localhost:5433/ptw_cmms_test', 'ptw_cmms_test (Test DB)');
}

main().catch((err) => {
  console.error('Migration & Seed failed:', err);
  process.exit(1);
});
