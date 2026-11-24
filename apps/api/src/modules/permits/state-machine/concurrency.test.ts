import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runMigrations } from '../../../db/migrate.js';
import { seedDatabase } from '../../../db/seed.js';
import { getPool, closeDbConnection } from '../../../db/client.js';
import { transition, mapPermitRow } from './transition-engine.js';
import { UserRole, PermitStatus, type PermitStatusCode } from '@ptw/shared';
import { AppError } from '../../../errors/app-error.js';

describe('State Machine Concurrency & SELECT FOR UPDATE Serialization', () => {
  let pool: ReturnType<typeof getPool>;
  let requesterUser: any;
  let areaOwnerUser: any;
  let safetyOfficerUser: any;
  let adminUser: any;
  let plantId: string;
  let areaId: string;
  let equipmentId: string;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = getPool();

    const usersRes = await pool.query('SELECT * FROM users');
    requesterUser = usersRes.rows.find((u) => u.email === 'requester@cmms.local');
    areaOwnerUser = usersRes.rows.find((u) => u.email === 'area.owner@cmms.local');
    safetyOfficerUser = usersRes.rows.find((u) => u.email === 'safety.officer@cmms.local');
    adminUser = usersRes.rows.find((u) => u.email === 'admin@cmms.local');

    const areaRes = await pool.query(
      'SELECT a.id as area_id, a.plant_id, e.id as equipment_id FROM areas a JOIN equipment e ON e.area_id = a.id WHERE a.owner_id = $1 LIMIT 1',
      [areaOwnerUser.id]
    );
    plantId = areaRes.rows[0].plant_id;
    areaId = areaRes.rows[0].area_id;
    equipmentId = areaRes.rows[0].equipment_id;
  });

  afterAll(async () => {
    await closeDbConnection();
  });

  async function createTestPermit(options: {
    status?: PermitStatusCode;
    type?: string;
    requesterId?: string;
    plannedStart?: Date;
    plannedEnd?: Date;
    details?: Record<string, unknown>;
  } = {}) {
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const permitNo = `PTW-TEST-CONCUR-${Date.now()}-${randomHex}`;
    const start = options.plannedStart || new Date('2026-06-01T08:00:00Z');
    const end = options.plannedEnd || new Date('2026-06-01T16:00:00Z');
    const type = options.type || 'HOT_WORK';
    const status = options.status || PermitStatus.DRAFT;
    const reqId = options.requesterId || requesterUser.id;
    const details =
      options.details ||
      (type === 'HOT_WORK'
        ? {
            hot_work_type: 'welding',
            fire_watch_assigned: true,
            extinguisher_type: 'CO2',
            combustibles_cleared_radius_m: 15,
            gas_test: { lel_pct: 0, o2_pct: 20.9, tested_at: '2026-06-01T07:30:00Z' },
          }
        : {});

    const res = await pool.query(
      `INSERT INTO permits (
        permit_no, type, status, requester_id, contractor_team, work_description,
        plant_id, area_id, equipment_id, planned_start, planned_end, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        permitNo,
        type,
        status,
        reqId,
        'Mechanical Maintenance Team',
        'Hot work testing concurrency',
        plantId,
        areaId,
        equipmentId,
        start,
        end,
        JSON.stringify(details),
      ]
    );

    return mapPermitRow(res.rows[0]);
  }

  it('serializes two simultaneous approvals on the same permit via row lock without lost updates', async () => {
    // 1. Create a DRAFT permit and submit it so it has 2 approval rows (Area Owner + Safety Officer)
    const permit = await createTestPermit({ status: PermitStatus.DRAFT });
    const submitted = await transition(
      permit.id,
      'submit',
      { id: requesterUser.id, role: UserRole.REQUESTER },
      {},
      { now: new Date('2026-06-01T07:30:00Z') }
    );
    expect(submitted.status).toBe(PermitStatus.PENDING_APPROVAL);
    expect(submitted.version).toBe(2);

    // 2. Fire simultaneous approvals from Area Owner and Safety Officer
    const approveAreaOwner = transition(
      permit.id,
      'approve',
      { id: areaOwnerUser.id, role: UserRole.AREA_OWNER },
      { comment: 'Area owner approved concurrent' },
      { now: new Date('2026-06-01T07:35:00Z') }
    );

    const approveSafetyOfficer = transition(
      permit.id,
      'approve',
      { id: safetyOfficerUser.id, role: UserRole.SAFETY_OFFICER },
      { comment: 'Safety officer approved concurrent' },
      { now: new Date('2026-06-01T07:35:00Z') }
    );

    const results = await Promise.all([approveAreaOwner, approveSafetyOfficer]);

    // Both promises resolve without deadlock or collision
    expect(results.length).toBe(2);

    // 3. Inspect final state in database: permit must be APPROVED with version = 4
    const finalPermitRes = await pool.query('SELECT * FROM permits WHERE id = $1', [permit.id]);
    const finalPermit = finalPermitRes.rows[0];
    expect(finalPermit.status).toBe(PermitStatus.APPROVED);
    expect(finalPermit.version).toBe(4);

    // 4. Verify both approval rows are marked APPROVED with their respective deciders
    const approvalsRes = await pool.query(
      'SELECT * FROM permit_approvals WHERE permit_id = $1 ORDER BY required_role ASC',
      [permit.id]
    );
    expect(approvalsRes.rows.length).toBe(2);
    expect(approvalsRes.rows.every((a) => a.status === 'APPROVED')).toBe(true);

    const aoRow = approvalsRes.rows.find((a) => a.required_role === UserRole.AREA_OWNER);
    const soRow = approvalsRes.rows.find((a) => a.required_role === UserRole.SAFETY_OFFICER);
    expect(aoRow.decided_by).toBe(areaOwnerUser.id);
    expect(soRow.decided_by).toBe(safetyOfficerUser.id);

    // 5. Verify audit_log recorded exactly 3 events: submit, approve, approve
    const auditRes = await pool.query(
      'SELECT action FROM audit_log WHERE permit_id = $1 ORDER BY created_at ASC',
      [permit.id]
    );
    expect(auditRes.rows.map((r) => r.action)).toEqual(['submit', 'approve', 'approve']);
  });

  it('handles concurrent approve vs reject deterministically: exactly one succeeds, the other fails with 409', async () => {
    // 1. Create a permit in PENDING_APPROVAL with Area Owner already approved, leaving only Safety Officer pending
    const permit = await createTestPermit({ status: PermitStatus.DRAFT });
    await transition(
      permit.id,
      'submit',
      { id: requesterUser.id, role: UserRole.REQUESTER },
      {},
      { now: new Date('2026-06-01T07:30:00Z') }
    );
    await transition(
      permit.id,
      'approve',
      { id: areaOwnerUser.id, role: UserRole.AREA_OWNER },
      { comment: 'Area owner approved first tier' },
      { now: new Date('2026-06-01T07:32:00Z') }
    );

    // 2. Safety Officer simultaneously attempts to 'approve' (would make it APPROVED)
    //    and Area Owner (or Admin) simultaneously attempts to 'reject'
    const approvePromise = transition(
      permit.id,
      'approve',
      { id: safetyOfficerUser.id, role: UserRole.SAFETY_OFFICER },
      { comment: 'Safety approval signoff' },
      { now: new Date('2026-06-01T07:35:00Z') }
    );

    const rejectPromise = transition(
      permit.id,
      'reject',
      { id: adminUser.id, role: UserRole.ADMIN },
      { comment: 'Safety concerns raised during inspection' },
      { now: new Date('2026-06-01T07:35:00Z') }
    );

    const results = await Promise.allSettled([approvePromise, rejectPromise]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one action wins the row lock and succeeds
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeInstanceOf(AppError);
    expect(rejectionReason.statusCode).toBe(409);

    // Final database state is consistent with whichever action won
    const finalPermitRes = await pool.query('SELECT status FROM permits WHERE id = $1', [permit.id]);
    const finalStatus = finalPermitRes.rows[0].status;
    expect([PermitStatus.APPROVED, PermitStatus.REJECTED]).toContain(finalStatus);
  });

  it('handles concurrent double activate: exactly one succeeds, the other fails with 409 ILLEGAL_TRANSITION', async () => {
    // 1. Create an APPROVED permit ready for activation
    const permit = await createTestPermit({
      status: PermitStatus.APPROVED,
      plannedStart: new Date('2026-06-01T08:00:00Z'),
      plannedEnd: new Date('2026-06-01T16:00:00Z'),
    });

    await pool.query(
      `INSERT INTO permit_approvals (permit_id, required_role, status)
       VALUES ($1, 'AREA_OWNER', 'APPROVED'), ($1, 'SAFETY_OFFICER', 'APPROVED')`,
      [permit.id]
    );

    const clock = new Date('2026-06-01T08:15:00Z');

    // 2. Fire two simultaneous activate calls from the requester
    const activate1 = transition(
      permit.id,
      'activate',
      { id: requesterUser.id, role: UserRole.REQUESTER },
      {},
      { now: clock }
    );

    const activate2 = transition(
      permit.id,
      'activate',
      { id: requesterUser.id, role: UserRole.REQUESTER },
      {},
      { now: clock }
    );

    const results = await Promise.allSettled([activate1, activate2]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const failedReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(failedReason).toBeInstanceOf(AppError);
    expect(failedReason.statusCode).toBe(409);
    expect(failedReason.code).toBe('ILLEGAL_TRANSITION');
    expect(failedReason.message).toContain("Action 'activate' is not permitted from status 'ACTIVE'");

    // 3. Database is in ACTIVE status with exactly one activate audit entry
    const finalPermitRes = await pool.query('SELECT status, version FROM permits WHERE id = $1', [
      permit.id,
    ]);
    expect(finalPermitRes.rows[0].status).toBe(PermitStatus.ACTIVE);
    expect(finalPermitRes.rows[0].version).toBe(2);

    const auditRes = await pool.query(
      'SELECT action FROM audit_log WHERE permit_id = $1 AND action = $2',
      [permit.id, 'activate']
    );
    expect(auditRes.rows.length).toBe(1);
  });

  it('handles concurrent activate vs cancel: exactly one succeeds, the other fails with 409', async () => {
    // 1. Create an APPROVED permit
    const permit = await createTestPermit({
      status: PermitStatus.APPROVED,
      plannedStart: new Date('2026-06-01T08:00:00Z'),
      plannedEnd: new Date('2026-06-01T16:00:00Z'),
    });

    await pool.query(
      `INSERT INTO permit_approvals (permit_id, required_role, status)
       VALUES ($1, 'AREA_OWNER', 'APPROVED'), ($1, 'SAFETY_OFFICER', 'APPROVED')`,
      [permit.id]
    );

    const clock = new Date('2026-06-01T08:15:00Z');

    // 2. Fire concurrent activate vs cancel
    const activatePromise = transition(
      permit.id,
      'activate',
      { id: requesterUser.id, role: UserRole.REQUESTER },
      {},
      { now: clock }
    );

    const cancelPromise = transition(
      permit.id,
      'cancel',
      { id: requesterUser.id, role: UserRole.REQUESTER },
      { comment: 'Job cancelled by supervisor' },
      { now: clock }
    );

    const results = await Promise.allSettled([activatePromise, cancelPromise]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedReason).toBeInstanceOf(AppError);
    expect(rejectedReason.statusCode).toBe(409);

    const finalRes = await pool.query('SELECT status FROM permits WHERE id = $1', [permit.id]);
    expect([PermitStatus.ACTIVE, PermitStatus.CANCELLED]).toContain(finalRes.rows[0].status);
  });
});
