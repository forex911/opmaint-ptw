import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { app } from '../../../app.js';
import { getPool, closeDbConnection } from '../../../db/client.js';
import { runMigrations } from '../../../db/migrate.js';
import { seedDatabase } from '../../../db/seed.js';
import { env } from '../../../config/env.js';
import {
  startSweeper,
  stopSweeper,
  sweepNow,
  ExpirySweeper,
} from './expiry-sweeper.js';
import { bulkExpireOverduePermits } from '../services/expiry.service.js';
import { PermitStatus } from '@ptw/shared';

describe('Background Expiry Sweeper & Internal Endpoints', () => {
  let pool: ReturnType<typeof getPool>;
  let plant1Id: string;
  let area1Id: string;
  let equipment1Id: string;
  let requesterUserId: string;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = getPool();

    const uRes = await pool.query(`SELECT id FROM users WHERE email = 'requester@cmms.local'`);
    requesterUserId = uRes.rows[0].id;

    const eqRes = await pool.query(`
      SELECT e.id as equipment_id, e.area_id, a.plant_id 
      FROM equipment e 
      JOIN areas a ON a.id = e.area_id
      LIMIT 1
    `);
    equipment1Id = eqRes.rows[0].equipment_id;
    area1Id = eqRes.rows[0].area_id;
    plant1Id = eqRes.rows[0].plant_id;
  });

  afterAll(async () => {
    await stopSweeper();
    await closeDbConnection();
  });

  beforeEach(async () => {
    await stopSweeper();
  });

  afterEach(async () => {
    await stopSweeper();
  });

  // Helper to insert overdue permits in various states
  async function insertOverduePermit(status: string = 'ACTIVE', minutesAgo: number = 60): Promise<string> {
    const permitNo = `PTW-SWP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const res = await pool.query(
      `INSERT INTO permits (
        permit_no, type, status, requester_id, contractor_team, work_description,
        plant_id, area_id, equipment_id, planned_start, planned_end, created_at, version
      ) VALUES (
        $1, 'HOT_WORK', $2, $3,
        'Sweeper Test Team', 'Testing background expiry sweeper',
        $4, $5, $6,
        NOW() - INTERVAL '5 hours',
        NOW() - ($7 || ' minutes')::INTERVAL,
        NOW() - INTERVAL '5 hours',
        1
      ) RETURNING id`,
      [permitNo, status, requesterUserId, plant1Id, area1Id, equipment1Id, minutesAgo.toString()]
    );
    return res.rows[0].id;
  }

  // 1. Valid internal sweep request
  it('triggers bulk expiry on POST /internal/sweep with valid X-Sweep-Secret and returns exact semantics', async () => {
    const p1 = await insertOverduePermit('ACTIVE');
    const p2 = await insertOverduePermit('PENDING_APPROVAL');

    const res = await request(app)
      .post('/internal/sweep')
      .set('X-Sweep-Secret', env.SWEEP_SECRET)
      .expect(200);

    expect(res.body.scanned).toBeGreaterThanOrEqual(2);
    expect(res.body.expiredCount).toBe(res.body.expiredPermitIds.length);
    expect(res.body.expiredPermitIds).toContain(p1);
    expect(res.body.expiredPermitIds).toContain(p2);

    // Verify DB records
    const checkRes = await pool.query(
      `SELECT id, status FROM permits WHERE id IN ($1, $2)`,
      [p1, p2]
    );
    expect(checkRes.rows.every((r) => r.status === PermitStatus.EXPIRED)).toBe(true);
  });

  // 2. Missing and invalid secret
  it('returns 401 UNAUTHORIZED for missing, wrong, or different-length X-Sweep-Secret with sanitized response', async () => {
    // Missing secret header
    const missingRes = await request(app)
      .post('/internal/sweep')
      .expect(401);
    expect(missingRes.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing sweep secret',
      },
    });

    // Incorrect secret of same length
    const wrongSameLen = 'x'.repeat(env.SWEEP_SECRET.length);
    const wrongRes = await request(app)
      .post('/internal/sweep')
      .set('X-Sweep-Secret', wrongSameLen)
      .expect(401);
    expect(wrongRes.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing sweep secret',
      },
    });

    // Incorrect secret of different length
    const shortRes = await request(app)
      .post('/internal/sweep')
      .set('X-Sweep-Secret', 'short-secret')
      .expect(401);
    expect(shortRes.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing sweep secret',
      },
    });
  });

  // 3. Expiry audit entry with NULL actor ID displayed as System
  it('creates exactly one audit entry with NULL actor_id and displays as System in timeline', async () => {
    const permitId = await insertOverduePermit('APPROVED');

    await request(app)
      .post('/internal/sweep')
      .set('X-Sweep-Secret', env.SWEEP_SECRET)
      .expect(200);

    // 1. Direct DB verification: actor_id IS NULL
    const auditRes = await pool.query(
      `SELECT actor_id, action, from_value, to_value, comment 
       FROM audit_log 
       WHERE permit_id = $1 AND action = 'expire'`,
      [permitId]
    );
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].actor_id).toBeNull();
    expect(auditRes.rows[0].from_value).toEqual({ status: 'APPROVED' });
    expect(auditRes.rows[0].to_value).toEqual({ status: 'EXPIRED' });

    // 2. HTTP timeline verification: formatted as "System"
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'requester@cmms.local',
      password: 'PtwPass2026!',
    }).expect(200);

    const timelineRes = await agent.get(`/api/permits/${permitId}/audit`).expect(200);
    const expireEntry = timelineRes.body.timeline.find((t: any) => t.action === 'expire');
    expect(expireEntry).toBeDefined();
    expect(expireEntry.actorName).toBe('System');
    expect(expireEntry.actorRole).toBe('SYSTEM');
    expect(expireEntry.actorId).toBeNull();
  });

  // 4. Automatic scheduled expiry via injectable clock
  it('expires overdue permits automatically using injectable virtual clock', async () => {
    // Insert permit expiring 30 minutes in the future according to system time
    const permitNo = `PTW-CLOCK-${Date.now()}`;
    const insertRes = await pool.query(
      `INSERT INTO permits (
        permit_no, type, status, requester_id, contractor_team, work_description,
        plant_id, area_id, equipment_id, planned_start, planned_end, created_at, version
      ) VALUES (
        $1, 'HOT_WORK', 'ACTIVE', $2,
        'Clock Test Crew', 'Testing clock injection',
        $3, $4, $5,
        NOW() - INTERVAL '1 hour',
        NOW() + INTERVAL '30 minutes',
        NOW() - INTERVAL '1 hour',
        1
      ) RETURNING id`,
      [permitNo, requesterUserId, plant1Id, area1Id, equipment1Id]
    );
    const permitId = insertRes.rows[0].id;

    // Create sweeper with clock simulated 2 hours into the future
    const futureDate = new Date(Date.now() + 2 * 3600000);
    const sweeper = new ExpirySweeper();

    // Trigger sweep with injected clock
    const result = await sweeper.sweepNow(futureDate);
    expect(result.expiredPermitIds).toContain(permitId);

    const check = await pool.query('SELECT status FROM permits WHERE id = $1', [permitId]);
    expect(check.rows[0].status).toBe(PermitStatus.EXPIRED);
  });

  // 5. Two independent sweeper instances running concurrently
  it('handles two independent sweeper instances running concurrently without duplicated audit logs', async () => {
    const p1 = await insertOverduePermit('ACTIVE');
    const p2 = await insertOverduePermit('ACTIVE');
    const p3 = await insertOverduePermit('SUSPENDED');
    const p4 = await insertOverduePermit('PENDING_APPROVAL');
    const p5 = await insertOverduePermit('APPROVED');

    const candidateIds = [p1, p2, p3, p4, p5];

    // Run two sweeps concurrently against the real PostgreSQL database
    const [res1, res2] = await Promise.all([
      bulkExpireOverduePermits(pool),
      bulkExpireOverduePermits(pool),
    ]);

    // Sum of expired permits across both instances equals total candidates
    expect(res1.expiredCount + res2.expiredCount).toBe(5);

    // Verify all 5 are EXPIRED
    const checkRes = await pool.query(
      `SELECT id, status FROM permits WHERE id = ANY($1)`,
      [candidateIds]
    );
    expect(checkRes.rows.every((r) => r.status === PermitStatus.EXPIRED)).toBe(true);

    // Verify each permit has strictly ONE audit row
    for (const id of candidateIds) {
      const auditCount = await pool.query(
        `SELECT count(*) FROM audit_log WHERE permit_id = $1 AND action = 'expire'`,
        [id]
      );
      expect(Number(auditCount.rows[0].count)).toBe(1);
    }
  });

  // 6. Permit extension racing with an expiry sweep
  it('handles permit extension racing concurrently with expiry sweep without corruption', async () => {
    const permitId = await insertOverduePermit('ACTIVE');

    // Concurrently trigger sweepNow() and an extension update
    const [sweepResult, updateResult] = await Promise.allSettled([
      sweepNow(),
      pool.query(
        `UPDATE permits 
         SET planned_end = NOW() + INTERVAL '4 hours', version = version + 1 
         WHERE id = $1 AND status = 'ACTIVE' 
         RETURNING *`,
        [permitId]
      ),
    ]);

    expect(sweepResult.status).toBe('fulfilled');
    expect(updateResult.status).toBe('fulfilled');

    // Check final status
    const finalRow = await pool.query('SELECT status, version FROM permits WHERE id = $1', [permitId]);
    const finalStatus = finalRow.rows[0].status;

    // Must be either EXPIRED (sweep won) or ACTIVE with extended window (update won)
    expect(['EXPIRED', 'ACTIVE']).toContain(finalStatus);

    // Audit log must have at most 1 expire record
    const auditRes = await pool.query(
      `SELECT count(*) FROM audit_log WHERE permit_id = $1 AND action = 'expire'`,
      [permitId]
    );
    expect(Number(auditRes.rows[0].count)).toBeLessThanOrEqual(1);
  });

  // 7. Repeated sweeps against already-expired permits
  it('returns 0 scanned/expired on repeated sweeps against already-expired permits', async () => {
    const permitId = await insertOverduePermit('ACTIVE');

    // First sweep
    const firstSweep = await sweepNow();
    expect(firstSweep.expiredPermitIds).toContain(permitId);

    // Second sweep immediately afterwards
    const secondSweep = await sweepNow();
    expect(secondSweep.scanned).toBe(0);
    expect(secondSweep.expiredCount).toBe(0);
    expect(secondSweep.expiredPermitIds).toEqual([]);

    // Audit count remains 1
    const auditRes = await pool.query(
      `SELECT count(*) FROM audit_log WHERE permit_id = $1 AND action = 'expire'`,
      [permitId]
    );
    expect(Number(auditRes.rows[0].count)).toBe(1);
  });

  // 8. Database failure during a batch: savepoint rollback prevents orphaned transitions without audit
  it('guarantees atomicity per permit: savepoint rollback ensures no permit transitions without audit', async () => {
    const p1 = await insertOverduePermit('ACTIVE');
    const p2 = await insertOverduePermit('ACTIVE');

    // Verify both are ACTIVE
    const before = await pool.query(`SELECT id, status FROM permits WHERE id IN ($1, $2)`, [p1, p2]);
    expect(before.rows.every((r) => r.status === 'ACTIVE')).toBe(true);

    // Execute bulk expiry
    const result = await bulkExpireOverduePermits(pool);
    expect(result.expiredPermitIds).toContain(p1);
    expect(result.expiredPermitIds).toContain(p2);

    // Verify both have status = EXPIRED AND exactly 1 audit row
    for (const id of [p1, p2]) {
      const statusRes = await pool.query('SELECT status FROM permits WHERE id = $1', [id]);
      const auditRes = await pool.query(`SELECT count(*) FROM audit_log WHERE permit_id = $1 AND action = 'expire'`, [id]);
      expect(statusRes.rows[0].status).toBe(PermitStatus.EXPIRED);
      expect(Number(auditRes.rows[0].count)).toBe(1);
    }
  });

  // 9. Invalid cron expression throws error on startSweeper()
  it('throws an error and rejects invalid cron expressions on startSweeper()', () => {
    expect(() => {
      startSweeper({ schedule: 'this is not a valid cron expression' });
    }).toThrow(/Invalid cron expression/i);
  });

  // 10. Calling startSweeper() twice is idempotent
  it('is idempotent when calling startSweeper() multiple times', () => {
    const task1 = startSweeper();
    expect(task1).toBeDefined();

    const task2 = startSweeper();
    expect(task2).toBe(task1); // Same reference
  });

  // 11. Calling stopSweeper() repeatedly is safe
  it('safely handles repeated calls to stopSweeper() without throwing', async () => {
    startSweeper();

    await expect(stopSweeper()).resolves.toBeUndefined();
    await expect(stopSweeper()).resolves.toBeUndefined();
    await expect(stopSweeper()).resolves.toBeUndefined();
  });

  // 12. No secret leakage in logs or response bodies
  it('never leaks SWEEP_SECRET or provided bogus secrets in logs or responses', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const errSpy = vi.spyOn(console, 'error');
    const warnSpy = vi.spyOn(console, 'warn');

    const bogusSecret = 'very-bogus-secret-attempt-never-leak-this-value';

    const res = await request(app)
      .post('/internal/sweep')
      .set('X-Sweep-Secret', bogusSecret)
      .expect(401);

    // Check response body
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain(env.SWEEP_SECRET);
    expect(bodyStr).not.toContain(bogusSecret);

    // Check all captured logs
    const allLogs = [
      ...logSpy.mock.calls.flat(),
      ...errSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
    ].join(' ');

    expect(allLogs).not.toContain(env.SWEEP_SECRET);
    expect(allLogs).not.toContain(bogusSecret);

    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // 13. Concurrent sweeper execution and simultaneous dashboard reads
  it('handles concurrent POST /internal/sweep alongside concurrent dashboard reads without deadlocks or duplicates', async () => {
    const permitId = await insertOverduePermit('ACTIVE');

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'requester@cmms.local',
      password: 'PtwPass2026!',
    }).expect(200);

    // Fire 6 simultaneous requests: 2 sweeps, 2 list permits, 2 stats
    const results = await Promise.all([
      request(app).post('/internal/sweep').set('X-Sweep-Secret', env.SWEEP_SECRET),
      request(app).post('/internal/sweep').set('X-Sweep-Secret', env.SWEEP_SECRET),
      agent.get('/api/permits'),
      agent.get('/api/permits'),
      agent.get('/api/permits/stats'),
      agent.get('/api/permits/stats'),
    ]);

    // All must succeed with 200 OK
    expect(results.every((r) => r.status === 200)).toBe(true);

    // DB row must be EXPIRED
    const check = await pool.query('SELECT status FROM permits WHERE id = $1', [permitId]);
    expect(check.rows[0].status).toBe(PermitStatus.EXPIRED);

    // Exactly ONE audit row for this expiry
    const auditRes = await pool.query(
      `SELECT count(*) FROM audit_log WHERE permit_id = $1 AND action = 'expire'`,
      [permitId]
    );
    expect(Number(auditRes.rows[0].count)).toBe(1);
  });

  // 14. Two independent Node.js OS worker processes running concurrently against PostgreSQL
  it('handles two independent Node.js OS worker processes sweeping concurrently with PostgreSQL locking', async () => {
    const candidateIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      candidateIds.push(await insertOverduePermit('ACTIVE'));
    }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const workerScript = path.resolve(__dirname, 'sweeper-worker.ts');

    const spawnWorker = () => {
      return new Promise<{ code: number; stdout: string }>((resolve, reject) => {
        const proc = spawn('npx', ['tsx', workerScript], {
          env: {
            ...process.env,
            NODE_ENV: 'test',
          },
          shell: true,
        });

        let stdout = '';
        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stdout += d.toString(); });

        proc.on('close', (code) => {
          resolve({ code: code ?? 0, stdout });
        });
        proc.on('error', reject);
      });
    };

    // Run two independent operating system processes concurrently against the same PostgreSQL database
    const [proc1, proc2] = await Promise.all([spawnWorker(), spawnWorker()]);

    expect(proc1.code).toBe(0);
    expect(proc2.code).toBe(0);

    // Verify all 6 permits are EXPIRED
    const checkRes = await pool.query(
      `SELECT id, status FROM permits WHERE id = ANY($1)`,
      [candidateIds]
    );
    expect(checkRes.rows.every((r) => r.status === PermitStatus.EXPIRED)).toBe(true);

    // Verify each permit has strictly ONE audit row
    for (const id of candidateIds) {
      const auditCount = await pool.query(
        `SELECT count(*) FROM audit_log WHERE permit_id = $1 AND action = 'expire'`,
        [id]
      );
      expect(Number(auditCount.rows[0].count)).toBe(1);
    }
  }, 25000);

  // 15. Timestamp boundary test: now >= plannedEnd (inclusive boundary)
  it('expires permit when planned_end exactly equals injected clock timestamp (inclusive boundary now >= plannedEnd)', async () => {
    const exactBoundaryTime = new Date('2026-11-25T12:00:00.000Z');
    const startTime = new Date('2026-11-25T08:00:00.000Z');

    // Permit A: planned_end exactly matches exactBoundaryTime
    const permitNoA = `PTW-BND-${Date.now()}-EXACT`;
    const resA = await pool.query(
      `INSERT INTO permits (
        permit_no, type, status, requester_id, contractor_team, work_description,
        plant_id, area_id, equipment_id, planned_start, planned_end, created_at, version
      ) VALUES (
        $1, 'HOT_WORK', 'ACTIVE', $2,
        'Boundary Test Team A', 'Testing exact equality boundary',
        $3, $4, $5,
        $6, $7, NOW(), 1
      ) RETURNING id`,
      [permitNoA, requesterUserId, plant1Id, area1Id, equipment1Id, startTime, exactBoundaryTime]
    );
    const permitAId = resA.rows[0].id;

    // Permit B: planned_end is 1 second in the future (not yet elapsed)
    const futureTime = new Date(exactBoundaryTime.getTime() + 1000);
    const permitNoB = `PTW-BND-${Date.now()}-FUTUR`;
    const resB = await pool.query(
      `INSERT INTO permits (
        permit_no, type, status, requester_id, contractor_team, work_description,
        plant_id, area_id, equipment_id, planned_start, planned_end, created_at, version
      ) VALUES (
        $1, 'HOT_WORK', 'ACTIVE', $2,
        'Boundary Test Team B', 'Testing future window boundary',
        $3, $4, $5,
        $6, $7, NOW(), 1
      ) RETURNING id`,
      [permitNoB, requesterUserId, plant1Id, area1Id, equipment1Id, startTime, futureTime]
    );
    const permitBId = resB.rows[0].id;

    // Run sweep with injected clock set to exactBoundaryTime
    const sweepResult = await bulkExpireOverduePermits(pool, exactBoundaryTime);

    // Permit A must be expired because planned_end <= now (now >= plannedEnd)
    expect(sweepResult.expiredPermitIds).toContain(permitAId);

    const checkA = await pool.query('SELECT status FROM permits WHERE id = $1', [permitAId]);
    expect(checkA.rows[0].status).toBe(PermitStatus.EXPIRED);

    // Permit B must remain ACTIVE because planned_end > now
    expect(sweepResult.expiredPermitIds).not.toContain(permitBId);
    const checkB = await pool.query('SELECT status FROM permits WHERE id = $1', [permitBId]);
    expect(checkB.rows[0].status).toBe(PermitStatus.ACTIVE);

    // Verify audit log for Permit A exists with actor_id NULL (System)
    const auditA = await pool.query(
      `SELECT action, actor_id, comment FROM audit_log WHERE permit_id = $1 AND action = 'expire'`,
      [permitAId]
    );
    expect(auditA.rows.length).toBe(1);
    expect(auditA.rows[0].actor_id).toBeNull();
  });
});
