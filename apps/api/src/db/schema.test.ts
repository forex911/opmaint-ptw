import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pkg from 'pg';
const { Pool } = pkg;
import { runMigrations } from './migrate.js';
import { seedDatabase } from './seed.js';
import { getNextPermitNumber } from './client.js';
import { ALL_USER_ROLES, ALL_PERMIT_STATUSES, PermitTypeCode } from '@ptw/shared';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres@localhost:5433/ptw_cmms_test';

describe('Database Schema, Migrations, Constraints, & Audit Trigger', () => {
  let pool: pkg.Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    // Run migrations on the test database
    await runMigrations();
    // Seed initial data so foreign key references exist for constraint tests
    await seedDatabase();
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

  it('enforces append-only audit_log trigger: blocks TRUNCATE operations', async () => {
    const client = await pool.connect();
    try {
      await expect(client.query('TRUNCATE TABLE audit_log')).rejects.toThrow(
        /audit_log is append-only: TRUNCATE is strictly prohibited/
      );
    } finally {
      client.release();
    }
  });

  it('enforces append-only admin_audit_log triggers: blocks UPDATE, DELETE, and TRUNCATE', async () => {
    const client = await pool.connect();
    try {
      const userRes = await client.query('SELECT id FROM users LIMIT 1');
      const actorId = userRes.rows[0].id;
      const entityId = userRes.rows[0].id;

      const res = await client.query(
        `INSERT INTO admin_audit_log (actor_id, entity_type, entity_id, action, from_value, to_value)
         VALUES ($1, 'USER', $2, 'TEST_ADMIN_ACTION', '{"role":"REQUESTER"}'::jsonb, '{"role":"ADMIN"}'::jsonb)
         RETURNING id`,
        [actorId, entityId]
      );
      const adminAuditId = res.rows[0].id;

      await expect(
        client.query("UPDATE admin_audit_log SET action = 'TAMPERED' WHERE id = $1", [adminAuditId])
      ).rejects.toThrow(/admin_audit_log is append-only/);

      await expect(
        client.query('DELETE FROM admin_audit_log WHERE id = $1', [adminAuditId])
      ).rejects.toThrow(/admin_audit_log is append-only/);

      await expect(client.query('TRUNCATE TABLE admin_audit_log')).rejects.toThrow(
        /admin_audit_log is append-only: TRUNCATE is strictly prohibited/
      );
    } finally {
      client.release();
    }
  });

  it('enforces ON DELETE RESTRICT on audit_log.permit_id preventing permit deletion while audit logs exist', async () => {
    const client = await pool.connect();
    try {
      // Find a permit that has audit rows
      const permitRes = await client.query(
        'SELECT permit_id FROM audit_log WHERE permit_id IS NOT NULL LIMIT 1;'
      );
      if (permitRes.rows.length > 0) {
        const permitId = permitRes.rows[0].permit_id;
        await expect(
          client.query('DELETE FROM permits WHERE id = $1', [permitId])
        ).rejects.toThrow(/foreign key|violates foreign key constraint/i);
      }
    } finally {
      client.release();
    }
  });

  it('executes the seed script twice without error (idempotent verification): counts unchanged', async () => {
    // Run seed first time
    await seedDatabase(pool);

    const getCounts = async () => {
      const p = await pool.query('SELECT count(*) AS count FROM plants');
      const a = await pool.query('SELECT count(*) AS count FROM areas');
      const e = await pool.query('SELECT count(*) AS count FROM equipment');
      const u = await pool.query('SELECT count(*) AS count FROM users');
      const pm = await pool.query('SELECT count(*) AS count FROM permits');
      return {
        plants: parseInt(p.rows[0].count, 10),
        areas: parseInt(a.rows[0].count, 10),
        equipment: parseInt(e.rows[0].count, 10),
        users: parseInt(u.rows[0].count, 10),
        permits: parseInt(pm.rows[0].count, 10),
      };
    };

    const counts1 = await getCounts();

    // Verify small realistic set counts
    expect(counts1.plants).toBe(3);
    expect(counts1.areas).toBe(8);
    expect(counts1.equipment).toBe(26);
    expect(counts1.users).toBe(5);
    expect(counts1.permits).toBeGreaterThanOrEqual(11);

    // Run seed second time
    await seedDatabase(pool);

    const counts2 = await getCounts();

    // Row counts MUST remain strictly unchanged
    expect(counts2.plants).toBe(counts1.plants);
    expect(counts2.areas).toBe(counts1.areas);
    expect(counts2.equipment).toBe(counts1.equipment);
    expect(counts2.users).toBe(counts1.users);
    expect(counts2.permits).toBe(counts1.permits);

    // Verify all plants have non-empty code and address
    const invalidPlants = await pool.query(
      "SELECT count(*) AS count FROM plants WHERE code IS NULL OR address IS NULL OR code = '' OR address = ''"
    );
    expect(parseInt(invalidPlants.rows[0].count, 10)).toBe(0);

    // Verify all areas have non-empty code and assigned area owner
    const invalidAreas = await pool.query(
      "SELECT count(*) AS count FROM areas WHERE code IS NULL OR code = '' OR owner_id IS NULL"
    );
    expect(parseInt(invalidAreas.rows[0].count, 10)).toBe(0);

    // Verify all 10 distinct statuses are represented
    const statusesRes = await pool.query('SELECT DISTINCT status FROM permits');
    expect(statusesRes.rows.length).toBe(10);
  });

  it('enforces UNIQUE constraint on plants.code and areas.(plant_id, code)', async () => {
    const client = await pool.connect();
    try {
      // Attempt duplicate plant code
      await expect(
        client.query(
          "INSERT INTO plants (code, name, address) VALUES ('PLANT-CHE-01', 'Duplicate Plant', 'Some Address')"
        )
      ).rejects.toThrow(/plants_code_unique|unique constraint/i);

      // Attempt duplicate area (plant_id, code)
      const plantRes = await client.query("SELECT id FROM plants WHERE code = 'PLANT-CHE-01'");
      const plantId = plantRes.rows[0].id;
      const userRes = await client.query('SELECT id FROM users LIMIT 1');
      const userId = userRes.rows[0].id;

      await expect(
        client.query(
          "INSERT INTO areas (plant_id, code, name, owner_id) VALUES ($1, 'AREA-MPC-01', 'Duplicate Area', $2)",
          [plantId, userId]
        )
      ).rejects.toThrow(/areas_plant_id_code_unique|unique constraint/i);
    } finally {
      client.release();
    }
  });

  it('advances ptw_permit_no_seq past seeded permits so generating a new permit yields a unique number', async () => {
    await seedDatabase();
    const nextPermitNo = await getNextPermitNumber(pool);
    expect(nextPermitNo).toMatch(/^PTW-\d{4}-\d{4}$/);
    const existing = await pool.query('SELECT id FROM permits WHERE permit_no = $1', [nextPermitNo]);
    expect(existing.rows.length).toBe(0);
  });

  it('ensures SQL CHECK value lists strictly equal the shared enums (statuses, roles, permit types)', async () => {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT c.conname, pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE c.contype = 'c'
          AND c.conname IN ('users_role_check', 'permits_status_check', 'permits_type_check');
      `);

      const constraints = new Map<string, string>();
      for (const row of res.rows) {
        constraints.set(row.conname, row.def);
      }

      expect(constraints.has('users_role_check')).toBe(true);
      expect(constraints.has('permits_status_check')).toBe(true);
      expect(constraints.has('permits_type_check')).toBe(true);

      const extractValues = (def: string): string[] => {
        const matches = def.match(/'([^']+)'/g);
        return matches ? matches.map((m) => m.replace(/'/g, '')) : [];
      };

      const roleValues = extractValues(constraints.get('users_role_check')!);
      const statusValues = extractValues(constraints.get('permits_status_check')!);
      const typeValues = extractValues(constraints.get('permits_type_check')!);

      expect([...roleValues].sort()).toEqual([...ALL_USER_ROLES].sort());
      expect([...statusValues].sort()).toEqual([...ALL_PERMIT_STATUSES].sort());
      expect([...typeValues].sort()).toEqual([...Object.values(PermitTypeCode)].sort());
    } finally {
      client.release();
    }
  });
});
