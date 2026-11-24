import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pkg from 'pg';
const { Pool } = pkg;
import { runMigrations } from './migrate.js';
import { seedDatabase } from './seed.js';
import { getNextPermitNumber } from './client.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres@localhost:5433/ptw_cmms';

describe('Database Schema, Migrations, Constraints, & Audit Trigger', () => {
  let pool: pkg.Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    // Run migrations on the test database
    await runMigrations();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('generates sequential permit numbers atomically using sequence', async () => {
    const p1 = await getNextPermitNumber(pool);
    const p2 = await getNextPermitNumber(pool);

    expect(p1).toMatch(/^PTW-\d{4}-\d{4}$/);
    expect(p2).toMatch(/^PTW-\d{4}-\d{4}$/);
    expect(p1).not.toBe(p2);
  });

  it('enforces CHECK constraint: planned_end must be strictly greater than planned_start', async () => {
    const client = await pool.connect();
    try {
      const now = new Date();
      const earlier = new Date(now.getTime() - 3600000);

      // Attempt to insert permit where planned_end <= planned_start
      await expect(
        client.query(
          `
          INSERT INTO permits (
            permit_no, type, status, requester_id, contractor_team, work_description,
            plant_id, area_id, equipment_id, planned_start, planned_end
          ) VALUES (
            'PTW-BAD-WINDOW', 'HOT_WORK', 'DRAFT',
            (SELECT id FROM users LIMIT 1),
            'Team Test', 'Testing window constraint',
            (SELECT id FROM plants LIMIT 1),
            (SELECT id FROM areas LIMIT 1),
            (SELECT id FROM equipment LIMIT 1),
            $1, $2
          );
        `,
          [now, earlier] // planned_end is earlier than planned_start!
        )
      ).rejects.toThrow(/permits_window_check/);
    } finally {
      client.release();
    }
  });

  it('enforces CHECK constraint: status must be in allowed set', async () => {
    const client = await pool.connect();
    try {
      const now = new Date();
      const later = new Date(now.getTime() + 3600000);

      await expect(
        client.query(
          `
          INSERT INTO permits (
            permit_no, type, status, requester_id, contractor_team, work_description,
            plant_id, area_id, equipment_id, planned_start, planned_end
          ) VALUES (
            'PTW-BAD-STATUS', 'HOT_WORK', 'INVALID_STATUS_VALUE',
            (SELECT id FROM users LIMIT 1),
            'Team Test', 'Testing status constraint',
            (SELECT id FROM plants LIMIT 1),
            (SELECT id FROM areas LIMIT 1),
            (SELECT id FROM equipment LIMIT 1),
            $1, $2
          );
        `,
          [now, later]
        )
      ).rejects.toThrow(/permits_status_check/);
    } finally {
      client.release();
    }
  });

  it('enforces append-only audit_log trigger: blocks UPDATE operations', async () => {
    const client = await pool.connect();
    try {
      // 1. Insert a test audit record
      const res = await client.query(`
        INSERT INTO audit_log (action, comment)
        VALUES ('TEST_ACTION', 'Initial comment')
        RETURNING id;
      `);
      const auditId = res.rows[0].id;

      // 2. Attempt to update the audit record
      await expect(
        client.query(
          'UPDATE audit_log SET comment = $1 WHERE id = $2',
          ['Attempted Tampering', auditId]
        )
      ).rejects.toThrow(/audit_log is append-only/);
    } finally {
      client.release();
    }
  });

  it('enforces append-only audit_log trigger: blocks DELETE operations', async () => {
    const client = await pool.connect();
    try {
      // 1. Insert a test audit record
      const res = await client.query(`
        INSERT INTO audit_log (action, comment)
        VALUES ('TEST_DELETE_ACTION', 'Initial record')
        RETURNING id;
      `);
      const auditId = res.rows[0].id;

      // 2. Attempt to delete the audit record
      await expect(
        client.query('DELETE FROM audit_log WHERE id = $1', [auditId])
      ).rejects.toThrow(/audit_log is append-only/);
    } finally {
      client.release();
    }
  });

  it('executes the seed script twice without error (idempotent verification)', async () => {
    // Run seed first time
    await seedDatabase();

    // Run seed second time
    await seedDatabase();

    // Verify 4 users seeded
    const usersRes = await pool.query('SELECT count(*) AS count FROM users');
    expect(parseInt(usersRes.rows[0].count, 10)).toBeGreaterThanOrEqual(4);

    // Verify 11 permits seeded across all statuses
    const permitsRes = await pool.query('SELECT count(*) AS count FROM permits');
    expect(parseInt(permitsRes.rows[0].count, 10)).toBe(11);

    // Verify all 10 distinct statuses are represented
    const statusesRes = await pool.query('SELECT DISTINCT status FROM permits');
    expect(statusesRes.rows.length).toBe(10);
  });
});
