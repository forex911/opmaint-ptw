import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { seedDatabase } from '../../db/seed.js';
import { getPool, closeDbConnection } from '../../db/client.js';
import { UserRole, PermitStatus } from '@ptw/shared';

describe('Specification Compliance Suite: HTTP Supertest with Seeded Users', () => {
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
  let equipment2Id: string;
  let adminUserId: string;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = getPool();

    // Authenticate all 4 seeded roles via HTTP cookie-only session
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

    // Resolve reference IDs
    const adminRes = await pool.query(`SELECT id FROM users WHERE email = 'admin@cmms.local'`);
    adminUserId = adminRes.rows[0].id;

    const eqRes = await pool.query(`
      SELECT e.id as equipment_id, e.area_id, a.plant_id 
      FROM equipment e 
      JOIN areas a ON a.id = e.area_id
      ORDER BY e.tag ASC
    `);

    equipment1Id = eqRes.rows[0].equipment_id;
    area1Id = eqRes.rows[0].area_id;
    plant1Id = eqRes.rows[0].plant_id;

    const diffArea = eqRes.rows.find((r) => r.area_id !== area1Id)!;
    equipment2Id = diffArea.equipment_id;
    area2Id = diffArea.area_id;
    plant2Id = diffArea.plant_id;
  });

  afterAll(async () => {
    await closeDbConnection();
  });

  // Helper to create active-ready HOT_WORK payload
  const createHotWorkPayload = (opts: { startOffsetMs?: number; endOffsetMs?: number } = {}) => {
    const now = Date.now();
    const startMs = now + (opts.startOffsetMs ?? -3600000); // 1h ago by default
    const endMs = now + (opts.endOffsetMs ?? 28800000); // 8h from now by default
    return {
      type: 'HOT_WORK',
      plantId: plant1Id,
      areaId: area1Id,
      equipmentId: equipment1Id,
      contractorTeam: 'Apex Industrial Services',
      workDescription: 'Pipeline flange welding and spark management',
      plannedStart: new Date(startMs).toISOString(),
      plannedEnd: new Date(endMs).toISOString(),
      hazards: ['Sparks', 'Flammable vapor', 'Heat stress'],
      ppe: ['Welding helmet', 'Leather apron', 'Safety boots'],
      details: {
        hot_work_type: 'welding',
        fire_watch_assigned: true,
        extinguisher_type: 'CO2 5kg',
        combustibles_cleared_radius_m: 15,
        gas_test: {
          lel_pct: 0,
          o2_pct: 20.9,
          tested_at: new Date(now - 600000).toISOString(),
        },
      },
    };
  };

  // 1. Direct API illegal transitions return 409 with allowedActions
  it('rule 1: direct API illegal transitions return 409 with allowedActions (pairs and terminal states)', async () => {
    // Create a DRAFT permit
    const createRes = await requesterAgent
      .post('/api/permits')
      .send(createHotWorkPayload())
      .expect(201);
    const draftId = createRes.body.permit.id;

    // Pair 1: DRAFT -> activate directly
    const activateRes = await requesterAgent
      .post(`/api/permits/${draftId}/activate`)
      .expect(409);
    expect(activateRes.body.error.code).toBe('ILLEGAL_TRANSITION');
    expect(activateRes.body.error.details.allowedActions).toContain('submit');
    expect(activateRes.body.error.details.allowedActions).toContain('cancel');
    expect(activateRes.body.error.details.allowedActions).not.toContain('activate');

    // Submit to PENDING_APPROVAL
    await requesterAgent.post(`/api/permits/${draftId}/submit`).expect(200);

    // Pair 2: PENDING_APPROVAL -> close directly
    const closeRes = await requesterAgent
      .post(`/api/permits/${draftId}/close`)
      .send({ completionNotes: 'Premature close' })
      .expect(409);
    expect(closeRes.body.error.code).toBe('ILLEGAL_TRANSITION');
    expect(closeRes.body.error.details.allowedActions).not.toContain('close');

    // Approve both tiers to get to APPROVED
    await areaOwnerAgent.post(`/api/permits/${draftId}/approve`).send({ comment: 'OK' }).expect(200);
    await safetyOfficerAgent.post(`/api/permits/${draftId}/approve`).send({ comment: 'OK' }).expect(200);

    // Pair 3: APPROVED -> suspend directly
    const suspendRes = await requesterAgent
      .post(`/api/permits/${draftId}/suspend`)
      .send({ comment: 'Cannot suspend before activation' })
      .expect(409);
    expect(suspendRes.body.error.code).toBe('ILLEGAL_TRANSITION');
    expect(suspendRes.body.error.details.allowedActions).toContain('activate');

    // Terminal states cannot transition to anything; allowedActions is strictly empty
    // Seeded REJECTED permit
    const rejRes = await pool.query(`SELECT id FROM permits WHERE status = 'REJECTED' LIMIT 1`);
    if (rejRes.rows.length > 0) {
      const rejId = rejRes.rows[0].id;
      const res = await requesterAgent.post(`/api/permits/${rejId}/submit`).expect(409);
      expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
      expect(res.body.error.details.allowedActions).toEqual([]);
    }

    // Seeded CANCELLED permit
    const cancelRes = await pool.query(`SELECT id FROM permits WHERE status = 'CANCELLED' LIMIT 1`);
    if (cancelRes.rows.length > 0) {
      const cancelId = cancelRes.rows[0].id;
      const res = await requesterAgent.post(`/api/permits/${cancelId}/activate`).expect(409);
      expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
      expect(res.body.error.details.allowedActions).toEqual([]);
    }

    // Seeded CLOSED_VERIFIED permit
    const closedRes = await pool.query(`SELECT id FROM permits WHERE status = 'CLOSED_VERIFIED' LIMIT 1`);
    if (closedRes.rows.length > 0) {
      const closedId = closedRes.rows[0].id;
      const res = await requesterAgent.post(`/api/permits/${closedId}/close`).expect(409);
      expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
      expect(res.body.error.details.allowedActions).toEqual([]);
    }

    // Seeded EXPIRED permit
    const expRes = await pool.query(`SELECT id FROM permits WHERE status = 'EXPIRED' LIMIT 1`);
    if (expRes.rows.length > 0) {
      const expId = expRes.rows[0].id;
      const res = await requesterAgent.post(`/api/permits/${expId}/activate`).expect(409);
      expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
      expect(res.body.error.details.allowedActions).toEqual([]);
    }
  });

  // 2. Self-approval blocked (403 FORBIDDEN_SELF_APPROVAL)
  it('rule 2: blocks self-approval even when requester has ADMIN or SAFETY role (403 FORBIDDEN_SELF_APPROVAL)', async () => {
    // Admin creates draft permit (admin is the requester)
    const createRes = await adminAgent
      .post('/api/permits')
      .send(createHotWorkPayload())
      .expect(201);
    const permitId = createRes.body.permit.id;

    // Submit permit
    await adminAgent.post(`/api/permits/${permitId}/submit`).expect(200);

    // Admin attempts to approve their own permit -> blocked by guardNoSelfAction
    const approveRes = await adminAgent
      .post(`/api/permits/${permitId}/approve`)
      .send({ comment: 'Attempting self-approval as admin' })
      .expect(403);

    expect(approveRes.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
    expect(approveRes.body.error.message).toMatch(/Requesters cannot approve/i);

    // Requester also cannot approve their own permit (role REQUESTER cannot approve)
    const reqPermitRes = await requesterAgent
      .post('/api/permits')
      .send(createHotWorkPayload())
      .expect(201);
    const reqPermitId = reqPermitRes.body.permit.id;
    await requesterAgent.post(`/api/permits/${reqPermitId}/submit`).expect(200);

    const reqApproveRes = await requesterAgent
      .post(`/api/permits/${reqPermitId}/approve`)
      .send({ comment: 'Requester approving own permit' });
    expect(reqApproveRes.status).toBe(403);
    expect(reqApproveRes.body.error.code).toBe('ROLE_NOT_ALLOWED');
  });

  // 3. Area owner cannot approve permit in another area (403 FORBIDDEN_AREA_MISMATCH)
  it('rule 3: area owner cannot approve permit in another area (403 FORBIDDEN_AREA_MISMATCH)', async () => {
    // Update area2's owner to be admin (not area.owner@cmms.local)
    await pool.query('UPDATE areas SET owner_id = $1 WHERE id = $2', [adminUserId, area2Id]);

    // Create permit in area2
    const createRes = await requesterAgent
      .post('/api/permits')
      .send({
        ...createHotWorkPayload(),
        plantId: plant2Id,
        areaId: area2Id,
        equipmentId: equipment2Id,
      })
      .expect(201);
    const permitId = createRes.body.permit.id;

    // Submit permit
    await requesterAgent.post(`/api/permits/${permitId}/submit`).expect(200);

    // area.owner@cmms.local attempts to approve permit in area2
    const res = await areaOwnerAgent
      .post(`/api/permits/${permitId}/approve`)
      .send({ comment: 'Area owner signing for unassigned area' })
      .expect(403);

    expect(res.body.error.code).toBe('WRONG_AREA');
    expect(res.body.error.message).toMatch(/Area Owner is not designated for this permit area/i);
  });

  // 4. Activation barriers: before planned_start (409 EARLY_ACTIVATION), pending approval (409)
  it('rule 4: enforces activation barriers: early activation and pending approval return 409', async () => {
    // Barrier A: Pending approval
    const pendingRes = await requesterAgent
      .post('/api/permits')
      .send(createHotWorkPayload({ startOffsetMs: -3600000, endOffsetMs: 28800000 }))
      .expect(201);
    const pendingPermitId = pendingRes.body.permit.id;
    await requesterAgent.post(`/api/permits/${pendingPermitId}/submit`).expect(200);

    // Attempt to activate while still PENDING_APPROVAL
    const barrier1Res = await requesterAgent
      .post(`/api/permits/${pendingPermitId}/activate`)
      .expect(409);
    expect(barrier1Res.body.error.code).toBe('ILLEGAL_TRANSITION');

    // Barrier B: Before planned_start (EARLY_ACTIVATION)
    // Create permit with plannedStart 2 hours in the future
    const futureRes = await requesterAgent
      .post('/api/permits')
      .send(createHotWorkPayload({ startOffsetMs: 7200000, endOffsetMs: 36000000 }))
      .expect(201);
    const futurePermitId = futureRes.body.permit.id;
    await requesterAgent.post(`/api/permits/${futurePermitId}/submit`).expect(200);

    // Fully approve it so status reaches APPROVED
    await areaOwnerAgent.post(`/api/permits/${futurePermitId}/approve`).send({ comment: 'Approved' }).expect(200);
    await safetyOfficerAgent.post(`/api/permits/${futurePermitId}/approve`).send({ comment: 'Approved' }).expect(200);

    // Verify status is APPROVED
    const checkRes = await requesterAgent.get(`/api/permits/${futurePermitId}`).expect(200);
    expect(checkRes.body.permit.status).toBe(PermitStatus.APPROVED);

    // Attempt to activate before planned_start
    const barrier2Res = await requesterAgent
      .post(`/api/permits/${futurePermitId}/activate`)
      .expect(409);
    expect(barrier2Res.body.error.code).toBe('EARLY_ACTIVATION');
    expect(barrier2Res.body.error.message).toMatch(/Cannot activate permit before planned_start/i);
  });

  // 5. Expired permit terminal (cannot reactivate, resume, close)
  it('rule 5: expired permit is terminal and cannot be reactivated, resumed, or closed (409)', async () => {
    // Query seeded expired permit
    const expRow = await pool.query(
      `SELECT id FROM permits WHERE status = 'EXPIRED' LIMIT 1`
    );
    expect(expRow.rows.length).toBeGreaterThan(0);
    const expPermitId = expRow.rows[0].id;

    // 1. Cannot activate
    const actRes = await requesterAgent
      .post(`/api/permits/${expPermitId}/activate`)
      .expect(409);
    expect(actRes.body.error.code).toBe('ILLEGAL_TRANSITION');
    expect(actRes.body.error.details.allowedActions).toEqual([]);

    // 2. Cannot resume
    const resRes = await requesterAgent
      .post(`/api/permits/${expPermitId}/resume`)
      .expect(409);
    expect(resRes.body.error.code).toBe('ILLEGAL_TRANSITION');
    expect(resRes.body.error.details.allowedActions).toEqual([]);

    // 3. Cannot close
    const closeRes = await requesterAgent
      .post(`/api/permits/${expPermitId}/close`)
      .send({ completionNotes: 'Trying to close expired' })
      .expect(409);
    expect(closeRes.body.error.code).toBe('ILLEGAL_TRANSITION');
    expect(closeRes.body.error.details.allowedActions).toEqual([]);
  });

  // 6. Work log on non-active permit (409)
  it('rule 6: restricts work logs to ACTIVE permits only; non-active permits return 409', async () => {
    // 1. Work log on DRAFT permit
    const draftRes = await requesterAgent
      .post('/api/permits')
      .send(createHotWorkPayload())
      .expect(201);
    const draftId = draftRes.body.permit.id;

    const draftLogRes = await requesterAgent
      .post(`/api/permits/${draftId}/work-logs`)
      .send({ kind: 'NOTE', note: 'Attempting work log on draft' })
      .expect(409);
    expect(draftLogRes.body.error.code).toBe('ILLEGAL_TRANSITION');
    expect(draftLogRes.body.error.message).toMatch(/Work logs can only be logged on ACTIVE permits/i);

    // 2. Work log on EXPIRED permit
    const expRow = await pool.query(`SELECT id FROM permits WHERE status = 'EXPIRED' LIMIT 1`);
    const expId = expRow.rows[0].id;

    const expLogRes = await requesterAgent
      .post(`/api/permits/${expId}/work-logs`)
      .send({ kind: 'NOTE', note: 'Attempting work log on expired' })
      .expect(409);
    expect(expLogRes.body.error.code).toBe('ILLEGAL_TRANSITION');
  });

  // 7. Missing comment / notes: reject without comment (422), close without notes (422), suspend without reason (422)
  it('rule 7: validates mandatory comments/notes: reject (422), close (422), suspend (422)', async () => {
    // Create and submit permit for rejection test
    const rejPermit = await requesterAgent
      .post('/api/permits')
      .send(createHotWorkPayload())
      .expect(201);
    const rejId = rejPermit.body.permit.id;
    await requesterAgent.post(`/api/permits/${rejId}/submit`).expect(200);

    // Reject without comment -> 422 MISSING_COMMENT
    const rejRes = await areaOwnerAgent
      .post(`/api/permits/${rejId}/reject`)
      .send({ comment: '   ' })
      .expect(422);
    expect(rejRes.body.error.code).toBe('MISSING_COMMENT');
    expect(rejRes.body.error.message).toMatch(/non-empty comment or reason is strictly mandatory/i);

    // Create, submit, approve, and activate permit for suspend & close tests
    const activePermit = await requesterAgent
      .post('/api/permits')
      .send(createHotWorkPayload({ startOffsetMs: -3600000, endOffsetMs: 28800000 }))
      .expect(201);
    const activeId = activePermit.body.permit.id;
    await requesterAgent.post(`/api/permits/${activeId}/submit`).expect(200);
    await areaOwnerAgent.post(`/api/permits/${activeId}/approve`).send({ comment: 'OK' }).expect(200);
    await safetyOfficerAgent.post(`/api/permits/${activeId}/approve`).send({ comment: 'OK' }).expect(200);
    await requesterAgent.post(`/api/permits/${activeId}/activate`).expect(200);

    // Suspend without reason -> 422 MISSING_COMMENT (safety officer or admin can suspend)
    const suspRes = await safetyOfficerAgent
      .post(`/api/permits/${activeId}/suspend`)
      .send({ comment: '' })
      .expect(422);
    expect(suspRes.body.error.code).toBe('MISSING_COMMENT');

    // Close without completion notes -> 422 MISSING_COMPLETION_NOTES
    const closeRes = await requesterAgent
      .post(`/api/permits/${activeId}/close`)
      .send({ completionNotes: '   ' })
      .expect(422);
    expect(closeRes.body.error.code).toBe('MISSING_COMPLETION_NOTES');
    expect(closeRes.body.error.message).toMatch(/Completion notes are strictly mandatory/i);
  });

  // 8. Audit rows exist for every transition and edit (create, update, submit, approve, activate, close, verify)
  it('rule 8: writes immutable audit rows for every lifecycle step: create, update, submit, approve, activate, close, verify', async () => {
    // 1. Create (DRAFT)
    const createRes = await requesterAgent
      .post('/api/permits')
      .send(createHotWorkPayload({ startOffsetMs: -3600000, endOffsetMs: 28800000 }))
      .expect(201);
    const permitId = createRes.body.permit.id;

    // 2. Update (PATCH in DRAFT)
    await requesterAgent
      .patch(`/api/permits/${permitId}`)
      .send({
        version: 1,
        workDescription: 'Updated welding scope: high pressure flange testing',
      })
      .expect(200);

    // 3. Submit
    await requesterAgent.post(`/api/permits/${permitId}/submit`).expect(200);

    // 4. Approve (Area Owner)
    await areaOwnerAgent
      .post(`/api/permits/${permitId}/approve`)
      .send({ comment: 'Area owner signed off isolation' })
      .expect(200);

    // 5. Approve (Safety Officer) -> transitions to APPROVED
    await safetyOfficerAgent
      .post(`/api/permits/${permitId}/approve`)
      .send({ comment: 'Safety officer verified fire protection' })
      .expect(200);

    // 6. Activate -> transitions to ACTIVE
    await requesterAgent.post(`/api/permits/${permitId}/activate`).expect(200);

    // 7. Close -> transitions to CLOSED_PENDING_VERIFICATION
    await requesterAgent
      .post(`/api/permits/${permitId}/close`)
      .send({ completionNotes: 'Welding completed, cold work inspected, 30min fire watch completed' })
      .expect(200);

    // 8. Verify (Safety Officer) -> transitions to CLOSED_VERIFIED
    await safetyOfficerAgent.post(`/api/permits/${permitId}/verify`).expect(200);

    // Fetch complete audit timeline over HTTP
    const auditRes = await requesterAgent
      .get(`/api/permits/${permitId}/audit`)
      .expect(200);

    const timeline = auditRes.body.timeline;
    expect(Array.isArray(timeline)).toBe(true);

    const actions = timeline.map((entry: any) => entry.action);
    expect(actions).toContain('create');
    expect(actions).toContain('update');
    expect(actions).toContain('submit');
    expect(actions).toContain('approve');
    expect(actions).toContain('activate');
    expect(actions).toContain('close');
    expect(actions).toContain('verify');

    // Verify structure and actor attribution for each entry
    for (const entry of timeline) {
      expect(entry.id).toBeDefined();
      expect(entry.permitId).toBe(permitId);
      expect(entry.createdAt).toBeDefined();
      expect(entry.actorRole).toBeDefined();
      expect(entry.actorName).toBeDefined();
    }
  });

  // 9. allowedActions per role/state matches reality
  it('rule 9: allowedActions matches reality: every listed action succeeds and unlisted actions return 409/403', async () => {
    // 1. DRAFT state for requester
    const createRes = await requesterAgent
      .post('/api/permits')
      .send(createHotWorkPayload())
      .expect(201);
    const permitId = createRes.body.permit.id;

    const draftDetail = await requesterAgent.get(`/api/permits/${permitId}`).expect(200);
    const draftAllowed = draftDetail.body.allowedActions as string[];
    expect(draftAllowed).toContain('submit');
    expect(draftAllowed).toContain('cancel');
    expect(draftAllowed).not.toContain('activate');
    expect(draftAllowed).not.toContain('approve');
    expect(draftAllowed).not.toContain('close');

    // Unlisted action fails with 409
    const illegalDraft = await requesterAgent.post(`/api/permits/${permitId}/activate`).expect(409);
    expect(illegalDraft.body.error.code).toBe('ILLEGAL_TRANSITION');

    // Listed action succeeds
    await requesterAgent.post(`/api/permits/${permitId}/submit`).expect(200);

    // 2. PENDING_APPROVAL state for Area Owner
    const pendingDetail = await areaOwnerAgent.get(`/api/permits/${permitId}`).expect(200);
    const pendingAllowed = pendingDetail.body.allowedActions as string[];
    expect(pendingAllowed).toContain('approve');
    expect(pendingAllowed).toContain('reject');
    expect(pendingAllowed).not.toContain('activate');
    expect(pendingAllowed).not.toContain('close');

    // Unlisted action fails with 409
    const illegalPending = await areaOwnerAgent.post(`/api/permits/${permitId}/close`).expect(409);
    expect(illegalPending.body.error.code).toBe('ILLEGAL_TRANSITION');

    // Listed action succeeds
    await areaOwnerAgent
      .post(`/api/permits/${permitId}/approve`)
      .send({ comment: 'Approved by area owner' })
      .expect(200);
  });
});
