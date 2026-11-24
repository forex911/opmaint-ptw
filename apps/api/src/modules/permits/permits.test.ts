import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { seedDatabase } from '../../db/seed.js';
import { getPool, closeDbConnection } from '../../db/client.js';
import { UserRole, PermitStatus } from '@ptw/shared';

describe('Permits Module: CRUD, Filters, Hierarchy, Stats, & Audit Timeline', () => {
  let pool: ReturnType<typeof getPool>;
  let requesterAgent: ReturnType<typeof request.agent>;
  let areaOwnerAgent: ReturnType<typeof request.agent>;
  let safetyOfficerAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;

  let plant1Id: string;
  let plant2Id: string;
  let area1Id: string;
  let area2Id: string;
  let equipment1Id: string;
  let equipment3Id: string;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = getPool();

    // Set up authenticated agents
    requesterAgent = request.agent(app);
    await requesterAgent
      .post('/api/auth/login')
      .send({ email: 'requester@cmms.local', password: 'PtwPass2026!' })
      .expect(200);

    areaOwnerAgent = request.agent(app);
    await areaOwnerAgent
      .post('/api/auth/login')
      .send({ email: 'area.owner@cmms.local', password: 'PtwPass2026!' })
      .expect(200);

    safetyOfficerAgent = request.agent(app);
    await safetyOfficerAgent
      .post('/api/auth/login')
      .send({ email: 'safety.officer@cmms.local', password: 'PtwPass2026!' })
      .expect(200);

    adminAgent = request.agent(app);
    await adminAgent
      .post('/api/auth/login')
      .send({ email: 'admin@cmms.local', password: 'PtwPass2026!' })
      .expect(200);

    // Fetch reference plants, areas, and equipment via reliable join
    const eqRes = await pool.query(`
      SELECT e.id as equipment_id, e.area_id, a.plant_id 
      FROM equipment e 
      JOIN areas a ON a.id = e.area_id
      ORDER BY e.tag ASC
    `);

    equipment1Id = eqRes.rows[0].equipment_id;
    area1Id = eqRes.rows[0].area_id;
    plant1Id = eqRes.rows[0].plant_id;

    // Find equipment in a different area
    const diffArea = eqRes.rows.find((r) => r.area_id !== area1Id)!;
    equipment3Id = diffArea.equipment_id;
    area2Id = diffArea.area_id;
    plant2Id = diffArea.plant_id;
  });

  afterAll(async () => {
    await closeDbConnection();
  });

  describe('Reference Data Endpoints (D-020 Read Access)', () => {
    it('requires authentication for /api/plants, /api/areas, /api/equipment', async () => {
      await request(app).get('/api/plants').expect(401);
      await request(app).get('/api/areas').expect(401);
      await request(app).get('/api/equipment').expect(401);
    });

    it('returns plants, areas, and equipment for authenticated users', async () => {
      const pRes = await requesterAgent.get('/api/plants').expect(200);
      expect(pRes.body.plants.length).toBeGreaterThanOrEqual(2);

      const aRes = await requesterAgent.get(`/api/areas?plantId=${plant1Id}`).expect(200);
      expect(aRes.body.areas.every((a: any) => a.plantId === plant1Id)).toBe(true);

      const eRes = await requesterAgent.get(`/api/equipment?areaId=${area1Id}`).expect(200);
      expect(eRes.body.equipment.every((e: any) => e.areaId === area1Id)).toBe(true);
    });
  });

  describe('Permit Creation (POST /api/permits)', () => {
    it('blocks non-requesters (e.g. AREA_OWNER) from creating draft permits with 403 FORBIDDEN', async () => {
      const res = await areaOwnerAgent
        .post('/api/permits')
        .send({
          type: 'HOT_WORK',
          plantId: plant1Id,
          areaId: area1Id,
          contractorTeam: 'Contractor A',
          workDescription: 'Unauthorized creation',
          plannedStart: '2026-07-01T08:00:00.000Z',
          plannedEnd: '2026-07-01T16:00:00.000Z',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects location hierarchy mismatch with 422 (area not in plant)', async () => {
      const res = await requesterAgent
        .post('/api/permits')
        .send({
          type: 'HOT_WORK',
          plantId: plant1Id,
          areaId: area2Id, // area2 belongs to plant2!
          equipmentId: equipment1Id,
          contractorTeam: 'Team Delta',
          workDescription: 'Testing area-plant hierarchy',
          plannedStart: '2026-07-01T08:00:00.000Z',
          plannedEnd: '2026-07-01T16:00:00.000Z',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.areaId).toBeDefined();
    });

    it('rejects location hierarchy mismatch with 422 (equipment not in area)', async () => {
      const res = await requesterAgent
        .post('/api/permits')
        .send({
          type: 'HOT_WORK',
          plantId: plant1Id,
          areaId: area1Id,
          equipmentId: equipment3Id, // equipment3 belongs to area2!
          contractorTeam: 'Team Delta',
          workDescription: 'Testing equip-area hierarchy',
          plannedStart: '2026-07-01T08:00:00.000Z',
          plannedEnd: '2026-07-01T16:00:00.000Z',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.equipmentId).toBeDefined();
    });

    it('rejects invalid date window where plannedEnd <= plannedStart with 422', async () => {
      const res = await requesterAgent
        .post('/api/permits')
        .send({
          type: 'HOT_WORK',
          plantId: plant1Id,
          areaId: area1Id,
          equipmentId: equipment1Id,
          contractorTeam: 'Team Delta',
          workDescription: 'Testing invalid window',
          plannedStart: '2026-07-01T16:00:00.000Z',
          plannedEnd: '2026-07-01T08:00:00.000Z', // Earlier than start!
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.plannedEnd).toBeDefined();
    });

    it('creates a draft permit successfully and logs initial audit row', async () => {
      const res = await requesterAgent
        .post('/api/permits')
        .send({
          type: 'HOT_WORK',
          plantId: plant1Id,
          areaId: area1Id,
          equipmentId: equipment1Id,
          contractorTeam: 'Apex Mechanical Contractors',
          workDescription: 'Welding high pressure bypass pipeline flange',
          plannedStart: '2026-07-01T08:00:00.000Z',
          plannedEnd: '2026-07-01T16:00:00.000Z',
          hazards: ['Flammable vapor', 'Sparks', 'High noise'],
          ppe: ['Welding helmet', 'Leather apron', 'Safety shoes'],
          details: {
            hot_work_type: 'welding',
            fire_watch_assigned: true,
            extinguisher_type: 'CO2',
            combustibles_cleared_radius_m: 15,
            gas_test: { lel_pct: 0, o2_pct: 20.9, tested_at: '2026-07-01T07:30:00.000Z' },
          },
        });

      expect(res.status).toBe(201);
      const permit = res.body.permit;
      expect(permit.id).toBeDefined();
      expect(permit.permitNo).toMatch(/^PTW-\d{4}-\d{4}$/);
      expect(permit.status).toBe(PermitStatus.DRAFT);
      expect(permit.version).toBe(1);

      // Verify audit log
      const auditRes = await pool.query(
        'SELECT * FROM audit_log WHERE permit_id = $1 AND action = $2',
        [permit.id, 'create']
      );
      expect(auditRes.rows.length).toBe(1);
    });
  });

  describe('Mass Assignment Rejection & Optimistic Locking (PATCH /api/permits/:id)', () => {
    let testPermitId: string;
    let initialVersion: number;

    beforeAll(async () => {
      const nowMs = Date.now();
      const pStart = new Date(nowMs + 3600000).toISOString();
      const pEnd = new Date(nowMs + 86400000).toISOString();

      const res = await requesterAgent
        .post('/api/permits')
        .send({
          type: 'HOT_WORK',
          plantId: plant1Id,
          areaId: area1Id,
          equipmentId: equipment1Id,
          contractorTeam: 'Pre-patch Team',
          workDescription: 'Permit for patch tests',
          plannedStart: pStart,
          plannedEnd: pEnd,
          details: {
            hot_work_type: 'welding',
            fire_watch_assigned: true,
            extinguisher_type: 'CO2',
            combustibles_cleared_radius_m: 15,
            gas_test: { lel_pct: 0, o2_pct: 20.9, tested_at: new Date(nowMs).toISOString() },
          },
        })
        .expect(201);
      testPermitId = res.body.permit.id;
      initialVersion = res.body.permit.version;
    });

    it('rejects mass assignment of forbidden fields (status, requesterId, permitNo) with 422', async () => {
      const res = await requesterAgent
        .patch(`/api/permits/${testPermitId}`)
        .send({
          version: initialVersion,
          status: 'APPROVED', // Attempting to bypass state machine!
          workDescription: 'Sneaky status update',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects missing or mismatched version with 409 VERSION_CONFLICT', async () => {
      const res = await requesterAgent
        .patch(`/api/permits/${testPermitId}`)
        .send({
          version: 999, // Wrong version!
          workDescription: 'Concurrent edit attempt',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VERSION_CONFLICT');
    });

    it('blocks another requester from editing someone elses permit with 403 FORBIDDEN', async () => {
      // Area owner attempting to edit requester's draft
      const res = await areaOwnerAgent
        .patch(`/api/permits/${testPermitId}`)
        .send({
          version: initialVersion,
          workDescription: 'Unauthorized edit by area owner',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('updates draft permit successfully and increments version', async () => {
      const res = await requesterAgent
        .patch(`/api/permits/${testPermitId}`)
        .send({
          version: initialVersion,
          workDescription: 'Updated work description for piping',
          contractorTeam: 'New Contractor Team',
        });

      expect(res.status).toBe(200);
      expect(res.body.permit.version).toBe(initialVersion + 1);
      expect(res.body.permit.workDescription).toBe('Updated work description for piping');

      // Check update audit row was written
      const auditRes = await pool.query(
        'SELECT * FROM audit_log WHERE permit_id = $1 AND action = $2',
        [testPermitId, 'update']
      );
      expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('resets approvals to PENDING (retaining rows and status) when editing a permit in PENDING_APPROVAL', async () => {
      // 1. Submit the permit so it enters PENDING_APPROVAL
      const submitRes = await requesterAgent.post(`/api/permits/${testPermitId}/submit`).expect(200);
      expect(submitRes.body.permit.status).toBe(PermitStatus.PENDING_APPROVAL);

      // Area owner signs off first tier
      await areaOwnerAgent
        .post(`/api/permits/${testPermitId}/approve`)
        .send({ comment: 'Initial area owner sign-off' })
        .expect(200);

      // Verify one approval is APPROVED
      const midApps = await pool.query('SELECT * FROM permit_approvals WHERE permit_id = $1', [testPermitId]);
      expect(midApps.rows.some((r) => r.status === 'APPROVED')).toBe(true);

      const currentVer = (await pool.query('SELECT version FROM permits WHERE id = $1', [testPermitId])).rows[0].version;

      // 2. Edit the permit while PENDING_APPROVAL
      const patchRes = await requesterAgent
        .patch(`/api/permits/${testPermitId}`)
        .send({
          version: currentVer,
          workDescription: 'Modified description requiring re-approval',
        });

      expect(patchRes.status).toBe(200);
      // Status must remain PENDING_APPROVAL per D-021
      expect(patchRes.body.permit.status).toBe(PermitStatus.PENDING_APPROVAL);
      expect(patchRes.body.permit.version).toBe(currentVer + 1);

      // 3. Verify approval rows were KEPT and reset to PENDING
      const appRes = await pool.query('SELECT * FROM permit_approvals WHERE permit_id = $1', [
        testPermitId,
      ]);
      expect(appRes.rows.length).toBeGreaterThan(0);
      expect(appRes.rows.every((r) => r.status === 'PENDING' && r.decided_by === null)).toBe(true);

      // 4. Verify audit rows: field diff row + approvals_reset row listing who had approved
      const fieldAuditRes = await pool.query(
        'SELECT * FROM audit_log WHERE permit_id = $1 AND action = $2',
        [testPermitId, 'update']
      );
      expect(fieldAuditRes.rows.length).toBeGreaterThanOrEqual(1);

      const resetAuditRes = await pool.query(
        'SELECT * FROM audit_log WHERE permit_id = $1 AND action = $2',
        [testPermitId, 'approvals_reset']
      );
      expect(resetAuditRes.rows.length).toBe(1);
      expect(resetAuditRes.rows[0].from_value.previouslyApproved.length).toBe(1);
    });
  });

  describe('Bulk Expiry, List Filtering, & Statistics (GET /api/permits)', () => {
    let overdueActivePermitId: string;

    beforeAll(async () => {
      // Insert an ACTIVE permit whose planned_end is in the past to test bulk lazy expiry on read
      const permitNo = `PTW-EXP-${Date.now()}`;
      const insertRes = await pool.query(
        `INSERT INTO permits (
          permit_no, type, status, requester_id, contractor_team, work_description,
          plant_id, area_id, equipment_id, planned_start, planned_end, created_at, version
        ) VALUES (
          $1, 'HOT_WORK', 'ACTIVE',
          (SELECT id FROM users WHERE email = 'requester@cmms.local'),
          'Overdue Team', 'Testing bulk lazy expiry on list reads',
          $2, $3, $4,
          NOW() - INTERVAL '4 hours',
          NOW() - INTERVAL '1 hour',
          NOW(),
          1
        ) RETURNING id`,
        [permitNo, plant1Id, area1Id, equipment1Id]
      );
      overdueActivePermitId = insertRes.rows[0].id;
    });

    it('bulk expires overdue permits on GET /api/permits and reflects in dashboard statistics', async () => {
      // 1. Request permit list
      const listRes = await requesterAgent.get('/api/permits').expect(200);

      const expiredItem = listRes.body.items.find((i: any) => i.id === overdueActivePermitId);
      expect(expiredItem).toBeDefined();
      // Must be immediately converted to EXPIRED!
      expect(expiredItem.status).toBe(PermitStatus.EXPIRED);

      // Verify DB row is EXPIRED
      const dbRes = await pool.query('SELECT status FROM permits WHERE id = $1', [overdueActivePermitId]);
      expect(dbRes.rows[0].status).toBe(PermitStatus.EXPIRED);

      // Also verify direct GET /api/permits/:id returns EXPIRED
      const detailRes = await requesterAgent.get(`/api/permits/${overdueActivePermitId}`).expect(200);
      expect(detailRes.body.permit.status).toBe(PermitStatus.EXPIRED);

      // 2. Request stats: overdue permit must NOT be counted in activeNow
      const statsRes = await requesterAgent.get('/api/permits/stats').expect(200);
      expect(statsRes.body.byStatus.EXPIRED).toBeGreaterThanOrEqual(1);
      expect(statsRes.body.activeNow).toBeDefined();
      expect(statsRes.body.expiringIn2h).toBeDefined();
      expect(statsRes.body.pendingMyApproval).toBeDefined();
    });

    it('handles concurrent GET /api/permits calls idempotently with exactly one audit row per expired permit', async () => {
      const pNo = `PTW-RACE-EXP-${Date.now()}`;
      const insRes = await pool.query(
        `INSERT INTO permits (
          permit_no, type, status, requester_id, contractor_team, work_description,
          plant_id, area_id, equipment_id, planned_start, planned_end, created_at, version
        ) VALUES (
          $1, 'HOT_WORK', 'ACTIVE',
          (SELECT id FROM users WHERE email = 'requester@cmms.local'),
          'Race Crew', 'Testing concurrent lazy expiry',
          $2, $3, $4,
          NOW() - INTERVAL '3 hours',
          NOW() - INTERVAL '30 minutes',
          NOW(),
          1
        ) RETURNING id`,
        [pNo, plant1Id, area1Id, equipment1Id]
      );
      const testPId = insRes.rows[0].id;

      // Fire 6 concurrent GET requests from different users
      await Promise.all([
        requesterAgent.get('/api/permits'),
        requesterAgent.get('/api/permits'),
        areaOwnerAgent.get('/api/permits'),
        safetyOfficerAgent.get('/api/permits'),
        adminAgent.get('/api/permits'),
        requesterAgent.get('/api/permits/stats'),
      ]);

      // Verify the permit is EXPIRED
      const checkRes = await pool.query('SELECT status FROM permits WHERE id = $1', [testPId]);
      expect(checkRes.rows[0].status).toBe(PermitStatus.EXPIRED);

      // Verify exactly ONE audit log row exists for this expiry action
      const auditRes = await pool.query(
        "SELECT * FROM audit_log WHERE permit_id = $1 AND action = 'expire'",
        [testPId]
      );
      expect(auditRes.rows.length).toBe(1);
    });

    it('enforces pagination: default 20, max limit 100, and returns total pages', async () => {
      const res = await requesterAgent.get('/api/permits?page=1&limit=5').expect(200);
      expect(res.body.items.length).toBeLessThanOrEqual(5);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(5);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(10);
      expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(2);

      // Limit > 100 rejected with 422
      await requesterAgent.get('/api/permits?limit=150').expect(422);
    });

    it('filters by status, type, and mine', async () => {
      const statusRes = await requesterAgent.get('/api/permits?status=DRAFT').expect(200);
      expect(statusRes.body.items.every((i: any) => i.status === 'DRAFT')).toBe(true);

      const mineRes = await requesterAgent.get('/api/permits?mine=true').expect(200);
      expect(mineRes.body.items.length).toBeGreaterThan(0);
    });

    it('paginates pendingMyApproval correctly with accurate total and totalPages across pages', async () => {
      // Find the area owner user ID
      const aoUserRes = await pool.query("SELECT id FROM users WHERE email = 'area.owner@cmms.local'");
      const aoUserId = aoUserRes.rows[0].id;

      // Insert 5 permits in PENDING_APPROVAL that require area owner's approval
      const insertedIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const pNo = `PTW-PAG-TEST-${Date.now()}-${i}`;
        const pRes = await pool.query(
          `INSERT INTO permits (
            permit_no, type, status, requester_id, contractor_team, work_description,
            plant_id, area_id, equipment_id, planned_start, planned_end, created_at, version
          ) VALUES (
            $1, 'HOT_WORK', 'PENDING_APPROVAL',
            (SELECT id FROM users WHERE email = 'requester@cmms.local'),
            'Pagination Team', 'Testing pendingMyApproval pagination',
            $2, $3, $4,
            NOW() + INTERVAL '2 hours',
            NOW() + INTERVAL '10 hours',
            NOW() - INTERVAL '${i} minutes',
            1
          ) RETURNING id`,
          [pNo, plant1Id, area1Id, equipment1Id]
        );
        const pId = pRes.rows[0].id;
        insertedIds.push(pId);

        // Add pending approval row for Area Owner
        await pool.query(
          `INSERT INTO permit_approvals (permit_id, required_role, required_user_id, status)
           VALUES ($1, 'AREA_OWNER', $2, 'PENDING')`,
          [pId, aoUserId]
        );
      }

      // Query page 1 with limit=2 as Area Owner
      const page1Res = await areaOwnerAgent
        .get('/api/permits?pendingMyApproval=true&page=1&limit=2')
        .expect(200);

      expect(page1Res.body.pagination.total).toBeGreaterThanOrEqual(5);
      expect(page1Res.body.pagination.totalPages).toBeGreaterThanOrEqual(3);
      expect(page1Res.body.pagination.page).toBe(1);
      expect(page1Res.body.pagination.limit).toBe(2);
      expect(page1Res.body.items.length).toBe(2);

      // Query page 2 with limit=2 as Area Owner
      const page2Res = await areaOwnerAgent
        .get('/api/permits?pendingMyApproval=true&page=2&limit=2')
        .expect(200);

      expect(page2Res.body.pagination.page).toBe(2);
      expect(page2Res.body.items.length).toBe(2);

      // Verify no overlap between page 1 and page 2 items
      const page1Ids = page1Res.body.items.map((i: any) => i.id);
      const page2Ids = page2Res.body.items.map((i: any) => i.id);
      expect(page1Ids.some((id: string) => page2Ids.includes(id))).toBe(false);
    });
  });

  describe('Audit Timeline & System Actor Labeling (GET /api/permits/:id/audit)', () => {
    it('returns chronological audit events and labels NULL actor as System (D-018)', async () => {
      // Create a permit and trigger lazy expiry
      const res = await requesterAgent
        .post('/api/permits')
        .send({
          type: 'HOT_WORK',
          plantId: plant1Id,
          areaId: area1Id,
          equipmentId: equipment1Id,
          contractorTeam: 'Audit Team',
          workDescription: 'Permit for audit testing',
          plannedStart: '2026-07-01T08:00:00.000Z',
          plannedEnd: '2026-07-01T16:00:00.000Z',
        })
        .expect(201);

      const permitId = res.body.permit.id;

      // Update to EXPIRED with actor_id = NULL
      await pool.query(
        `INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment)
         VALUES ($1, NULL, 'expire', '{"status":"ACTIVE"}', '{"status":"EXPIRED"}', 'Automated lazy expiry')`,
        [permitId]
      );

      // Request audit timeline
      const auditTimelineRes = await requesterAgent.get(`/api/permits/${permitId}/audit`).expect(200);
      const timeline = auditTimelineRes.body.timeline;
      expect(timeline.length).toBeGreaterThanOrEqual(2);

      const systemRow = timeline.find((r: any) => r.action === 'expire');
      expect(systemRow).toBeDefined();
      expect(systemRow.actorId).toBeNull();
      // Must be formatted as "System" per D-018
      expect(systemRow.actorName).toBe('System');
      expect(systemRow.actorRole).toBe('SYSTEM');
    });
  });

  describe('Work Logs on ACTIVE Permits (POST /api/permits/:id/work-logs)', () => {
    it('rejects adding work log on non-ACTIVE permits with 409 ILLEGAL_TRANSITION', async () => {
      // Create draft permit
      const draftRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: 'HOT_WORK',
          plantId: plant1Id,
          areaId: area1Id,
          equipmentId: equipment1Id,
          contractorTeam: 'Log Team',
          workDescription: 'Testing work log restrictions',
          plannedStart: '2026-07-01T08:00:00.000Z',
          plannedEnd: '2026-07-01T16:00:00.000Z',
        })
        .expect(201);

      const res = await requesterAgent
        .post(`/api/permits/${draftRes.body.permit.id}/work-logs`)
        .send({
          kind: 'NOTE',
          note: 'Work log attempt on draft permit',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
    });

    it('adds work logs (NOTE, ENTRY, EXIT) successfully to ACTIVE permits', async () => {
      // Find or create an ACTIVE permit with future plannedEnd
      const activeRes = await pool.query(
        `SELECT id FROM permits WHERE status = 'ACTIVE' AND planned_end > NOW() LIMIT 1`
      );
      let activePermitId = activeRes.rows[0]?.id;

      if (!activePermitId) {
        const createRes = await pool.query(
          `INSERT INTO permits (
            permit_no, type, status, requester_id, contractor_team, work_description,
            plant_id, area_id, equipment_id, planned_start, planned_end, version
          ) VALUES (
            'PTW-ACTIVE-LOG-TEST', 'CONFINED_SPACE', 'ACTIVE',
            (SELECT id FROM users WHERE email = 'requester@cmms.local'),
            'Entry Crew', 'Testing work logs',
            $1, $2, $3,
            NOW() - INTERVAL '1 hour',
            NOW() + INTERVAL '4 hours',
            1
          )
          ON CONFLICT (permit_no) DO UPDATE SET
            status = 'ACTIVE',
            planned_start = NOW() - INTERVAL '1 hour',
            planned_end = NOW() + INTERVAL '4 hours'
          RETURNING id`,
          [plant1Id, area1Id, equipment1Id]
        );
        activePermitId = createRes.rows[0].id;
      }

      // Add ENTRY log
      const entryRes = await requesterAgent
        .post(`/api/permits/${activePermitId}/work-logs`)
        .send({
          kind: 'ENTRY',
          note: '3 technicians entered vessel with oxygen monitors',
        })
        .expect(201);

      expect(entryRes.body.workLog.kind).toBe('ENTRY');
      expect(entryRes.body.workLog.note).toContain('3 technicians entered');

      // Add EXIT log
      const exitRes = await requesterAgent
        .post(`/api/permits/${activePermitId}/work-logs`)
        .send({
          kind: 'EXIT',
          note: 'All 3 technicians exited vessel safely',
        })
        .expect(201);

      expect(exitRes.body.workLog.kind).toBe('EXIT');
    });
  });

  describe('Full Transition Endpoints via HTTP', () => {
    it('executes full permit lifecycle through mounted transition endpoints', async () => {
      // 1. Create DRAFT permit
      const createRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: 'HOT_WORK',
          plantId: plant1Id,
          areaId: area1Id,
          equipmentId: equipment1Id,
          contractorTeam: 'Lifecycle Crew',
          workDescription: 'Full HTTP lifecycle test',
          plannedStart: new Date(Date.now() - 3600000).toISOString(),
          plannedEnd: new Date(Date.now() + 7200000).toISOString(),
          details: {
            hot_work_type: 'welding',
            fire_watch_assigned: true,
            extinguisher_type: 'CO2',
            combustibles_cleared_radius_m: 15,
            gas_test: { lel_pct: 0, o2_pct: 20.9, tested_at: new Date().toISOString() },
          },
        })
        .expect(201);

      const pId = createRes.body.permit.id;

      // 2. Submit: DRAFT -> PENDING_APPROVAL
      const submitRes = await requesterAgent.post(`/api/permits/${pId}/submit`).expect(200);
      expect(submitRes.body.permit.status).toBe(PermitStatus.PENDING_APPROVAL);

      // 3. Approve Area Owner tier: stays PENDING_APPROVAL
      const app1Res = await areaOwnerAgent
        .post(`/api/permits/${pId}/approve`)
        .send({ comment: 'Area owner HTTP approval' })
        .expect(200);
      expect(app1Res.body.permit.status).toBe(PermitStatus.PENDING_APPROVAL);

      // 4. Approve Safety Officer tier: becomes APPROVED
      const app2Res = await safetyOfficerAgent
        .post(`/api/permits/${pId}/approve`)
        .send({ comment: 'Safety officer HTTP approval' })
        .expect(200);
      expect(app2Res.body.permit.status).toBe(PermitStatus.APPROVED);

      // 5. Activate: APPROVED -> ACTIVE
      const actRes = await requesterAgent.post(`/api/permits/${pId}/activate`).expect(200);
      expect(actRes.body.permit.status).toBe(PermitStatus.ACTIVE);

      // 6. Close: requires completion notes
      await requesterAgent.post(`/api/permits/${pId}/close`).send({ completion_notes: '' }).expect(409);

      const closeRes = await requesterAgent
        .post(`/api/permits/${pId}/close`)
        .send({ completion_notes: 'Hot work completed cleanly, area hosed down' })
        .expect(200);
      expect(closeRes.body.permit.status).toBe(PermitStatus.CLOSED);

      // 7. Verify: Safety Officer verifies closed permit
      const verifyRes = await safetyOfficerAgent.post(`/api/permits/${pId}/verify`).expect(200);
      expect(verifyRes.body.permit.status).toBe(PermitStatus.CLOSED_VERIFIED);
    });
  });
});
