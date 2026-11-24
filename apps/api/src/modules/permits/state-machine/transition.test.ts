import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runMigrations } from '../../../db/migrate.js';
import { seedDatabase, SEED_ACCOUNTS } from '../../../db/seed.js';
import { getPool, closeDbConnection, getNextPermitNumber } from '../../../db/client.js';
import { transition, mapPermitRow } from './transition-engine.js';
import { getAllowedActions, TRANSITION_TABLE } from './transitions.js';
import {
  UserRole,
  PermitStatus,
  ALL_PERMIT_STATUSES,
  type PermitStatusCode,
} from '@ptw/shared';
import { ALL_PERMIT_ACTIONS, type PermitAction } from './types.js';
import { AppError } from '../../../errors/app-error.js';

describe('State Machine Transitions, Pure Guards & Lazy Expiry', () => {
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

    // Fetch seeded users
    const usersRes = await pool.query('SELECT * FROM users');
    requesterUser = usersRes.rows.find((u) => u.email === 'requester@cmms.local');
    areaOwnerUser = usersRes.rows.find((u) => u.email === 'area.owner@cmms.local');
    safetyOfficerUser = usersRes.rows.find((u) => u.email === 'safety.officer@cmms.local');
    adminUser = usersRes.rows.find((u) => u.email === 'admin@cmms.local');

    const areaRes = await pool.query(
      'SELECT a.id as area_id, a.plant_id, e.id as equipment_id FROM areas a JOIN equipment e ON e.area_id = a.id WHERE a.owner_id = $1 LIMIT 1',
      [areaOwnerUser.id]
    );
    if (areaRes.rows.length === 0) {
      throw new Error(`No area with equipment found for area owner ${areaOwnerUser.id}`);
    }
    plantId = areaRes.rows[0].plant_id;
    areaId = areaRes.rows[0].area_id;
    equipmentId = areaRes.rows[0].equipment_id;
  });

  afterAll(async () => {
    await closeDbConnection();
  });

  // Helper to create an isolated permit in any initial status for testing
  async function createTestPermit(options: {
    status?: PermitStatusCode;
    type?: string;
    requesterId?: string;
    plannedStart?: Date;
    plannedEnd?: Date;
    details?: Record<string, unknown>;
  } = {}) {
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const permitNo = `PTW-TEST-${Date.now()}-${randomHex}`;
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
        'Hot work testing',
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

  describe('Exhaustive (Status x Action) Transition Matrix', () => {
    // Generate all 10 statuses x 10 actions = 100 test combinations
    for (const status of ALL_PERMIT_STATUSES) {
      for (const action of ALL_PERMIT_ACTIONS) {
        const isLegalInTable = TRANSITION_TABLE.some(
          (rule) => rule.action === action && rule.from.includes(status)
        );

        if (!isLegalInTable) {
          it(`rejects illegal transition '${action}' from status '${status}' with 409 ILLEGAL_TRANSITION`, async () => {
            const permit = await createTestPermit({
              status,
              plannedStart: new Date('2026-06-01T08:00:00Z'),
              plannedEnd: new Date('2026-06-01T16:00:00Z'),
            });

            // Use admin to test pure state-matrix barrier (bypassing role-only blocks)
            const actor = { id: adminUser.id, role: UserRole.ADMIN };
            const clock = new Date('2026-06-01T10:00:00Z');

            try {
              await transition(permit.id, action, actor, { comment: 'Test reason' }, { now: clock });
              expect.fail('Should have thrown 409 ILLEGAL_TRANSITION');
            } catch (err: any) {
              expect(err.statusCode).toBe(409);
              expect(err.code).toBe('ILLEGAL_TRANSITION');
              expect(err.details).toBeDefined();
              expect(err.details.allowedActions).toBeDefined();
            }
          });
        }
      }
    }
  });

  describe('getAllowedActions() Dynamic Calculation', () => {
    it('returns empty array when actor has no permissions on current state', async () => {
      const permit = await createTestPermit({ status: PermitStatus.DRAFT });
      // Area owner has no allowed actions on DRAFT status
      const actions = getAllowedActions(
        permit,
        { id: areaOwnerUser.id, role: UserRole.AREA_OWNER },
        [],
        new Date('2026-06-01T09:00:00Z')
      );
      expect(actions).toEqual([]);
    });

    it('returns submit and cancel for Requester on DRAFT permit', async () => {
      const permit = await createTestPermit({
        status: PermitStatus.DRAFT,
        requesterId: requesterUser.id,
      });
      const actions = getAllowedActions(
        permit,
        { id: requesterUser.id, role: UserRole.REQUESTER },
        [],
        new Date('2026-06-01T07:00:00Z')
      );
      expect(actions).toContain('submit');
      expect(actions).toContain('cancel');
    });

    it('returns approve and reject for Area Owner when pending approval row exists', async () => {
      const permit = await createTestPermit({ status: PermitStatus.PENDING_APPROVAL });
      const approvals = [
        {
          id: 'approval-1',
          permitId: permit.id,
          requiredRole: UserRole.AREA_OWNER,
          requiredUserId: areaOwnerUser.id,
          status: 'PENDING',
          decidedBy: null,
          decidedAt: null,
          comment: null,
          signatureData: null,
        },
      ];

      const actions = getAllowedActions(
        permit,
        { id: areaOwnerUser.id, role: UserRole.AREA_OWNER },
        approvals as any,
        new Date('2026-06-01T07:30:00Z')
      );
      expect(actions).toContain('approve');
      expect(actions).toContain('reject');
    });
  });

  describe('Submit Action & Approvals Creation (D-014 Area Owner Snapshot)', () => {
    it('submits a valid DRAFT permit to PENDING_APPROVAL and creates approval rows', async () => {
      const permit = await createTestPermit({
        status: PermitStatus.DRAFT,
        requesterId: requesterUser.id,
      });

      const updated = await transition(
        permit.id,
        'submit',
        { id: requesterUser.id, role: UserRole.REQUESTER },
        {},
        { now: new Date('2026-06-01T07:30:00Z') }
      );

      expect(updated.status).toBe(PermitStatus.PENDING_APPROVAL);
      expect(updated.version).toBe(2);

      // Verify approval rows were created
      const approvalsRes = await pool.query(
        'SELECT * FROM permit_approvals WHERE permit_id = $1 ORDER BY required_role ASC',
        [permit.id]
      );
      expect(approvalsRes.rows.length).toBe(2);

      const areaOwnerApproval = approvalsRes.rows.find((a) => a.required_role === UserRole.AREA_OWNER);
      expect(areaOwnerApproval).toBeDefined();
      expect(areaOwnerApproval.status).toBe('PENDING');
      // Snapshot required_user_id check (D-014)
      expect(areaOwnerApproval.required_user_id).toBe(areaOwnerUser.id);

      const safetyApproval = approvalsRes.rows.find((a) => a.required_role === UserRole.SAFETY_OFFICER);
      expect(safetyApproval).toBeDefined();
      expect(safetyApproval.status).toBe('PENDING');
      expect(safetyApproval.required_user_id).toBeNull();

      // Verify audit log row
      const auditRes = await pool.query(
        'SELECT * FROM audit_log WHERE permit_id = $1 AND action = $2',
        [permit.id, 'submit']
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].actor_id).toBe(requesterUser.id);
    });

    it('blocks submit if permit details fail submit schema validation', async () => {
      // Create permit with invalid details (missing required fire_watch_assigned)
      const invalidPermit = await createTestPermit({
        status: PermitStatus.DRAFT,
        details: { hot_work_type: 'welding' },
      });

      await expect(
        transition(
          invalidPermit.id,
          'submit',
          { id: requesterUser.id, role: UserRole.REQUESTER },
          {},
          { now: new Date('2026-06-01T07:30:00Z') }
        )
      ).rejects.toThrow(/validation failed/i);
    });
  });

  describe('Approval Tiers, Separation of Duties (D-019), & Self-Approval Block', () => {
    it('blocks self-approval: requester cannot approve their own permit', async () => {
      const permit = await createTestPermit({
        status: PermitStatus.DRAFT,
        requesterId: requesterUser.id,
      });
      await transition(
        permit.id,
        'submit',
        { id: requesterUser.id, role: UserRole.REQUESTER },
        {},
        { now: new Date('2026-06-01T07:30:00Z') }
      );

      // Requester attempts to approve
      await expect(
        transition(
          permit.id,
          'approve',
          { id: requesterUser.id, role: UserRole.AREA_OWNER },
          {},
          { now: new Date('2026-06-01T07:35:00Z') }
        )
      ).rejects.toThrow(/cannot approve/i);
    });

    it('stays PENDING_APPROVAL after first approval, transitions to APPROVED when all tiers complete', async () => {
      const permit = await createTestPermit({
        status: PermitStatus.DRAFT,
        requesterId: requesterUser.id,
      });
      await transition(
        permit.id,
        'submit',
        { id: requesterUser.id, role: UserRole.REQUESTER },
        {},
        { now: new Date('2026-06-01T07:30:00Z') }
      );

      // 1. Area Owner approves
      const afterFirstApprove = await transition(
        permit.id,
        'approve',
        { id: areaOwnerUser.id, role: UserRole.AREA_OWNER },
        { comment: 'Area cleared for work' },
        { now: new Date('2026-06-01T07:35:00Z') }
      );
      // Status remains PENDING_APPROVAL because Safety Officer is still pending
      expect(afterFirstApprove.status).toBe(PermitStatus.PENDING_APPROVAL);

      // 2. Safety Officer approves
      const afterSecondApprove = await transition(
        permit.id,
        'approve',
        { id: safetyOfficerUser.id, role: UserRole.SAFETY_OFFICER },
        { comment: 'Safety review passed' },
        { now: new Date('2026-06-01T07:40:00Z') }
      );
      // Both approved -> transitions to APPROVED
      expect(afterSecondApprove.status).toBe(PermitStatus.APPROVED);
    });

    it('enforces Separation of Duties (D-019): same person cannot approve two approval rows', async () => {
      const permit = await createTestPermit({
        status: PermitStatus.DRAFT,
        requesterId: requesterUser.id,
      });
      await transition(
        permit.id,
        'submit',
        { id: requesterUser.id, role: UserRole.REQUESTER },
        {},
        { now: new Date('2026-06-01T07:30:00Z') }
      );

      // Admin approves first tier (Area Owner row)
      await transition(
        permit.id,
        'approve',
        { id: adminUser.id, role: UserRole.ADMIN },
        { comment: 'Admin signing Area Owner clearance' },
        { now: new Date('2026-06-01T07:35:00Z') }
      );

      // Admin attempts to approve second tier (Safety Officer row)
      await expect(
        transition(
          permit.id,
          'approve',
          { id: adminUser.id, role: UserRole.ADMIN },
          { comment: 'Admin signing Safety Officer clearance' },
          { now: new Date('2026-06-01T07:40:00Z') }
        )
      ).rejects.toThrow(/Separation of duties violation/i);
    });

    it('rejecting a tier requires mandatory comment and transitions permit directly to REJECTED', async () => {
      const permit = await createTestPermit({
        status: PermitStatus.DRAFT,
        requesterId: requesterUser.id,
      });
      await transition(
        permit.id,
        'submit',
        { id: requesterUser.id, role: UserRole.REQUESTER },
        {},
        { now: new Date('2026-06-01T07:30:00Z') }
      );

      // Reject without comment must be rejected by guard
      await expect(
        transition(
          permit.id,
          'reject',
          { id: areaOwnerUser.id, role: UserRole.AREA_OWNER },
          { comment: '' },
          { now: new Date('2026-06-01T07:35:00Z') }
        )
      ).rejects.toThrow(/mandatory/i);

      // Reject with valid comment
      const rejected = await transition(
        permit.id,
        'reject',
        { id: areaOwnerUser.id, role: UserRole.AREA_OWNER },
        { comment: 'Combustible materials cannot be cleared today' },
        { now: new Date('2026-06-01T07:35:00Z') }
      );

      expect(rejected.status).toBe(PermitStatus.REJECTED);
    });
  });

  describe('Activation Guards & Confined Space Freshness (D-010)', () => {
    it('blocks early activation before planned_start', async () => {
      const permit = await createTestPermit({
        status: PermitStatus.APPROVED,
        plannedStart: new Date('2026-06-01T08:00:00Z'),
        plannedEnd: new Date('2026-06-01T16:00:00Z'),
      });

      // Populate approved rows so approval guard passes
      await pool.query(
        `INSERT INTO permit_approvals (permit_id, required_role, status)
         VALUES ($1, 'AREA_OWNER', 'APPROVED'), ($1, 'SAFETY_OFFICER', 'APPROVED')`,
        [permit.id]
      );

      // Clock is 07:55 (5 minutes before planned start)
      try {
        await transition(
          permit.id,
          'activate',
          { id: requesterUser.id, role: UserRole.REQUESTER },
          {},
          { now: new Date('2026-06-01T07:55:00Z') }
        );
        expect.fail('Should have thrown 409 EARLY_ACTIVATION');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('EARLY_ACTIVATION');
        expect(err.message).toMatch(/Cannot activate permit before planned_start/i);
      }
    });

    it('blocks activation of CONFINED_SPACE permit if gas test is older than 60 minutes', async () => {
      const permit = await createTestPermit({
        type: 'CONFINED_SPACE',
        status: PermitStatus.APPROVED,
        plannedStart: new Date('2026-06-01T08:00:00Z'),
        plannedEnd: new Date('2026-06-01T16:00:00Z'),
        details: {
          space_id: 'VESSEL-01',
          entry_point: 'Manhole North',
          standby_attendant: 'Karthik S',
          rescue_plan: 'Tripod hoist and retrieval harness tested',
          ventilation_method: 'Forced air blower 2000 CFM',
          atmosphere_test: {
            o2_pct: 20.8,
            lel_pct: 0,
            h2s_ppm: 0,
            co_ppm: 0,
            tested_at: '2026-06-01T06:30:00Z', // 90 minutes before activation time 08:00
          },
        },
      });

      await pool.query(
        `INSERT INTO permit_approvals (permit_id, required_role, status)
         VALUES ($1, 'AREA_OWNER', 'APPROVED'), ($1, 'SAFETY_OFFICER', 'APPROVED')`,
        [permit.id]
      );

      // Activation at 08:00 (gas test is 90 mins old -> stale)
      try {
        await transition(
          permit.id,
          'activate',
          { id: requesterUser.id, role: UserRole.REQUESTER },
          {},
          { now: new Date('2026-06-01T08:00:00Z') }
        );
        expect.fail('Should have thrown 409 STALE_GAS_TEST');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('STALE_GAS_TEST');
        expect(err.message).toMatch(/Gas test must be re-verified within 60 minutes/i);
      }
    });

    it('activates successfully when within window, approvals complete, and gas test is fresh', async () => {
      const permit = await createTestPermit({
        type: 'CONFINED_SPACE',
        status: PermitStatus.APPROVED,
        plannedStart: new Date('2026-06-01T08:00:00Z'),
        plannedEnd: new Date('2026-06-01T16:00:00Z'),
        details: {
          space_id: 'VESSEL-01',
          entry_point: 'Manhole North',
          standby_attendant: 'Karthik S',
          rescue_plan: 'Tripod hoist and retrieval harness tested',
          ventilation_method: 'Forced air blower 2000 CFM',
          atmosphere_test: {
            o2_pct: 20.8,
            lel_pct: 0,
            h2s_ppm: 0,
            co_ppm: 0,
            tested_at: '2026-06-01T07:45:00Z', // 15 minutes before activation
          },
        },
      });

      await pool.query(
        `INSERT INTO permit_approvals (permit_id, required_role, status)
         VALUES ($1, 'AREA_OWNER', 'APPROVED'), ($1, 'SAFETY_OFFICER', 'APPROVED')`,
        [permit.id]
      );

      const activated = await transition(
        permit.id,
        'activate',
        { id: requesterUser.id, role: UserRole.REQUESTER },
        {},
        { now: new Date('2026-06-01T08:05:00Z') }
      );

      expect(activated.status).toBe(PermitStatus.ACTIVE);
    });
  });

  describe('Persistent Lazy Expiry Even When Action is Rejected', () => {
    it('commits EXPIRED status to database when action is attempted on an overdue permit, then returns 409', async () => {
      // 1. Create an ACTIVE permit with planned_end in the past
      const expiredPermit = await createTestPermit({
        status: PermitStatus.ACTIVE,
        plannedStart: new Date('2026-06-01T08:00:00Z'),
        plannedEnd: new Date('2026-06-01T12:00:00Z'),
      });

      // 2. Caller attempts to 'close' the permit at 12:30 (30 mins overdue)
      const clock = new Date('2026-06-01T12:30:00Z');

      let lazyError: any;
      try {
        await transition(
          expiredPermit.id,
          'close',
          { id: requesterUser.id, role: UserRole.REQUESTER },
          { completion_notes: 'Finished late' },
          { now: clock }
        );
        expect.fail('Should have thrown 409 ILLEGAL_TRANSITION');
      } catch (err: any) {
        lazyError = err;
      }

      expect(lazyError.statusCode).toBe(409);
      expect(lazyError.code).toBe('ILLEGAL_TRANSITION');
      expect(lazyError.message).toContain('Permit has expired');

      // 3. Verify that EXPIRED was permanently committed in the database!
      const checkRes = await pool.query('SELECT status, version FROM permits WHERE id = $1', [
        expiredPermit.id,
      ]);
      expect(checkRes.rows[0].status).toBe(PermitStatus.EXPIRED);

      // 4. Verify audit_log recorded the lazy expire with NULL actor (D-018)
      const auditRes = await pool.query(
        'SELECT * FROM audit_log WHERE permit_id = $1 AND action = $2',
        [expiredPermit.id, 'expire']
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].actor_id).toBeNull();
      expect(auditRes.rows[0].comment).toContain('Automated lazy expiry');
    });
  });

  describe('Lifecycle Completion: Close, Verify, and Suspension', () => {
    it('requires completion notes to close an ACTIVE permit', async () => {
      const permit = await createTestPermit({
        status: PermitStatus.ACTIVE,
        plannedStart: new Date('2026-06-01T08:00:00Z'),
        plannedEnd: new Date('2026-06-01T16:00:00Z'),
      });

      // Attempt to close without notes
      try {
        await transition(
          permit.id,
          'close',
          { id: requesterUser.id, role: UserRole.REQUESTER },
          { completion_notes: '' },
          { now: new Date('2026-06-01T14:00:00Z') }
        );
        expect.fail('Should have thrown 422 MISSING_COMPLETION_NOTES');
      } catch (err: any) {
        expect(err.statusCode).toBe(422);
        expect(err.code).toBe('MISSING_COMPLETION_NOTES');
        expect(err.message).toMatch(/Completion notes are strictly mandatory/i);
      }

      // Close with valid notes
      const closed = await transition(
        permit.id,
        'close',
        { id: requesterUser.id, role: UserRole.REQUESTER },
        { completion_notes: 'Welding completed, fire watch monitored for 30 minutes post-job' },
        { now: new Date('2026-06-01T14:00:00Z') }
      );

      expect(closed.status).toBe(PermitStatus.CLOSED);
      expect(closed.closedAt).toBeDefined();
    });

    it('blocks self-verification by the requester and allows Safety Officer verification', async () => {
      const permit = await createTestPermit({
        status: PermitStatus.CLOSED,
        requesterId: requesterUser.id,
      });

      // Requester attempts to verify
      await expect(
        transition(
          permit.id,
          'verify',
          { id: requesterUser.id, role: UserRole.SAFETY_OFFICER },
          {},
          { now: new Date('2026-06-01T15:00:00Z') }
        )
      ).rejects.toThrow(/cannot approve, reject, or verify/i);

      // Independent Safety Officer verifies
      const verified = await transition(
        permit.id,
        'verify',
        { id: safetyOfficerUser.id, role: UserRole.SAFETY_OFFICER },
        {},
        { now: new Date('2026-06-01T15:00:00Z') }
      );

      expect(verified.status).toBe(PermitStatus.CLOSED_VERIFIED);
      expect(verified.verifiedBy).toBe(safetyOfficerUser.id);
    });

    it('suspends an ACTIVE permit with reason and resumes if not expired', async () => {
      const permit = await createTestPermit({
        status: PermitStatus.ACTIVE,
        plannedStart: new Date('2026-06-01T08:00:00Z'),
        plannedEnd: new Date('2026-06-01T16:00:00Z'),
      });

      // Suspend
      const suspended = await transition(
        permit.id,
        'suspend',
        { id: safetyOfficerUser.id, role: UserRole.SAFETY_OFFICER },
        { comment: 'Rain shower observed; electrical hazard outdoors' },
        { now: new Date('2026-06-01T11:00:00Z') }
      );
      expect(suspended.status).toBe(PermitStatus.SUSPENDED);

      // Resume
      const resumed = await transition(
        permit.id,
        'resume',
        { id: safetyOfficerUser.id, role: UserRole.SAFETY_OFFICER },
        {},
        { now: new Date('2026-06-01T13:00:00Z') }
      );
      expect(resumed.status).toBe(PermitStatus.ACTIVE);
    });
  });

  describe('Independent Hand-Written Specification State Diagram Matrix', () => {
    /**
     * Hand-written expected transition matrix copied directly from the assignment's domain state diagram:
     * - Normal progression:
     *   DRAFT -> PENDING_APPROVAL -> APPROVED -> ACTIVE -> SUSPENDED -> ACTIVE -> CLOSED -> CLOSED_VERIFIED
     * - Rejection:
     *   PENDING_APPROVAL -> REJECTED
     * - Cancellation:
     *   Non-terminal statuses can transition to CANCELLED: DRAFT, PENDING_APPROVAL, APPROVED, SUSPENDED
     * - Automated / Lazy Expiry:
     *   Overdue statuses transition to EXPIRED: PENDING_APPROVAL, APPROVED, ACTIVE, SUSPENDED (DRAFT is NOT expirable)
     * - Terminal statuses:
     *   CLOSED_VERIFIED, CANCELLED, REJECTED, EXPIRED have strictly zero legal outgoing actions.
     */
    const SPEC_EXPECTED_TRANSITIONS: Record<PermitAction, readonly PermitStatus[]> = {
      submit: [PermitStatus.DRAFT],
      approve: [PermitStatus.PENDING_APPROVAL],
      reject: [PermitStatus.PENDING_APPROVAL],
      activate: [PermitStatus.APPROVED],
      suspend: [PermitStatus.ACTIVE],
      resume: [PermitStatus.SUSPENDED],
      close: [PermitStatus.ACTIVE],
      verify: [PermitStatus.CLOSED],
      cancel: [
        PermitStatus.DRAFT,
        PermitStatus.PENDING_APPROVAL,
        PermitStatus.APPROVED,
        PermitStatus.SUSPENDED,
      ],
      expire: [
        PermitStatus.PENDING_APPROVAL,
        PermitStatus.APPROVED,
        PermitStatus.ACTIVE,
        PermitStatus.SUSPENDED,
      ],
    };

    it('verifies that TRANSITION_TABLE strictly matches the specification state diagram for all 10 statuses x 10 actions', () => {
      for (const action of ALL_PERMIT_ACTIONS) {
        const expectedFromStatuses = SPEC_EXPECTED_TRANSITIONS[action];
        const tableRules = TRANSITION_TABLE.filter((r) => r.action === action);
        const actualFromStatuses = tableRules.flatMap((r) => r.from);

        expect(
          [...new Set(actualFromStatuses)].sort(),
          `Action '${action}' allowed source statuses must strictly match assignment state diagram`
        ).toEqual([...new Set(expectedFromStatuses)].sort());
      }
    });

    it('verifies that terminal statuses (CLOSED_VERIFIED, CANCELLED, REJECTED, EXPIRED) have zero outgoing transitions', () => {
      const terminalStatuses: readonly PermitStatus[] = [
        PermitStatus.CLOSED_VERIFIED,
        PermitStatus.CANCELLED,
        PermitStatus.REJECTED,
        PermitStatus.EXPIRED,
      ];

      for (const terminal of terminalStatuses) {
        const outgoingRules = TRANSITION_TABLE.filter((r) => r.from.includes(terminal));
        expect(
          outgoingRules,
          `Terminal status '${terminal}' must have zero outgoing transitions`
        ).toEqual([]);
      }
    });

    it('lazily expires PENDING_APPROVAL permits when planned_end has passed, commits EXPIRED, logs System audit row, and rejects approve with 409', async () => {
      // 1. Create a PENDING_APPROVAL permit whose planned_end is in the past
      const permit = await createTestPermit({
        status: PermitStatus.DRAFT,
        requesterId: requesterUser.id,
        plannedStart: new Date('2026-06-01T08:00:00Z'),
        plannedEnd: new Date('2026-06-01T12:00:00Z'),
      });

      // Submit it so it enters PENDING_APPROVAL and creates approval rows
      await transition(
        permit.id,
        'submit',
        { id: requesterUser.id, role: UserRole.REQUESTER },
        {},
        { now: new Date('2026-06-01T07:30:00Z') }
      );

      // Verify it is in PENDING_APPROVAL
      const submittedRes = await pool.query('SELECT status FROM permits WHERE id = $1', [permit.id]);
      expect(submittedRes.rows[0].status).toBe(PermitStatus.PENDING_APPROVAL);

      // 2. Area Owner attempts to approve at 13:00 (1 hour after planned_end elapsed)
      const clock = new Date('2026-06-01T13:00:00Z');
      let caughtErr: any;
      try {
        await transition(
          permit.id,
          'approve',
          { id: areaOwnerUser.id, role: UserRole.AREA_OWNER },
          { comment: 'Late approval attempt' },
          { now: clock }
        );
        expect.fail('Should have thrown 409 ILLEGAL_TRANSITION');
      } catch (err: any) {
        caughtErr = err;
      }

      // Assert caller gets 409 ILLEGAL_TRANSITION
      expect(caughtErr).toBeDefined();
      expect(caughtErr.statusCode).toBe(409);
      expect(caughtErr.code).toBe('ILLEGAL_TRANSITION');
      expect(caughtErr.message).toContain('Permit has expired');

      // 3. Assert PostgreSQL row was permanently updated to EXPIRED
      const checkRes = await pool.query('SELECT status, version FROM permits WHERE id = $1', [
        permit.id,
      ]);
      expect(checkRes.rows[0].status).toBe(PermitStatus.EXPIRED);

      // 4. Assert automated System audit row exists with actor_id = NULL
      const auditRes = await pool.query(
        'SELECT * FROM audit_log WHERE permit_id = $1 AND action = $2',
        [permit.id, 'expire']
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].actor_id).toBeNull();
      expect(auditRes.rows[0].comment).toContain('Automated lazy expiry');
    });

    it('does NOT lazily expire DRAFT permits even if planned_end is in the past', async () => {
      const draftPermit = await createTestPermit({
        status: PermitStatus.DRAFT,
        requesterId: requesterUser.id,
        plannedStart: new Date('2026-06-01T08:00:00Z'),
        plannedEnd: new Date('2026-06-01T12:00:00Z'),
      });

      // Attempt an action like cancel at 13:00 (1 hour after planned_end)
      const clock = new Date('2026-06-01T13:00:00Z');
      const cancelled = await transition(
        draftPermit.id,
        'cancel',
        { id: requesterUser.id, role: UserRole.REQUESTER },
        { comment: 'Discarding stale draft' },
        { now: clock }
      );

      // It transitions directly to CANCELLED, NOT EXPIRED!
      expect(cancelled.status).toBe(PermitStatus.CANCELLED);

      // Verify no lazy expire audit row was logged
      const auditRes = await pool.query(
        'SELECT * FROM audit_log WHERE permit_id = $1 AND action = $2',
        [draftPermit.id, 'expire']
      );
      expect(auditRes.rows.length).toBe(0);
    });
  });
});
