import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { seedDatabase } from '../../db/seed.js';
import { getPool, closeDbConnection } from '../../db/client.js';
import { UserRole, PermitStatus, PermitTypeCode } from '@ptw/shared';

describe('Stage 8 End-to-End User Workflows & Permit Types Integration Suite', () => {
  let pool: ReturnType<typeof getPool>;
  let requesterAgent: ReturnType<typeof request.agent>;
  let areaOwnerAgent: ReturnType<typeof request.agent>;
  let safetyOfficerAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;

  let plantId: string;
  let areaId: string;
  let equipmentId: string;
  let requesterId: string;

  const validHotWorkDetails = {
    hot_work_type: 'welding',
    fire_watch_assigned: true,
    extinguisher_type: 'CO2 5kg',
    combustibles_cleared_radius_m: 15,
    gas_test: {
      lel_pct: 0,
      o2_pct: 20.9,
      tested_at: new Date().toISOString(),
    },
  };

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = getPool();

    // Authenticate all 4 seeded roles via HttpOnly cookie sessions
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

    const userRes = await pool.query(`SELECT id FROM users WHERE email = 'requester@cmms.local'`);
    requesterId = userRes.rows[0].id;

    const eqRes = await pool.query(`
      SELECT e.id as equipment_id, e.area_id, a.plant_id 
      FROM equipment e 
      JOIN areas a ON a.id = e.area_id 
      LIMIT 1
    `);
    equipmentId = eqRes.rows[0].equipment_id;
    areaId = eqRes.rows[0].area_id;
    plantId = eqRes.rows[0].plant_id;
  });

  afterAll(async () => {
    await closeDbConnection();
  });

  describe('Workflow A: Requester Journey (Draft, Edit, Submit, Audit)', () => {
    let createdPermitId: string;
    let initialVersion: number;

    it('Step 1 & 2: logs in and fetches dashboard statistics and reference data', async () => {
      const statsRes = await requesterAgent.get('/api/permits/stats').expect(200);
      expect(statsRes.body.byStatus).toBeDefined();
      expect(typeof statsRes.body.activeNow).toBe('number');

      const plantsRes = await requesterAgent.get('/api/plants').expect(200);
      expect(plantsRes.body.plants.length).toBeGreaterThan(0);
    });

    it('Step 3 & 4: creates a Hot Work permit and saves it as DRAFT', async () => {
      const plannedStart = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();

      const createRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Apex Welding Specialists',
          workDescription: 'Pipeline flange replacement and spool weld',
          plannedStart,
          plannedEnd,
          hazards: ['Flammable gases', 'Hot surfaces', 'Sparks'],
          ppe: ['Welding shield', 'Fire-retardant coverall', 'Leather gloves'],
          details: validHotWorkDetails,
        })
        .expect(201);

      expect(createRes.body.permit).toBeDefined();
      expect(createRes.body.permit.status).toBe(PermitStatus.DRAFT);
      expect(createRes.body.permit.permitNo).toMatch(/^PTW-/);
      createdPermitId = createRes.body.permit.id;
      initialVersion = createRes.body.permit.version;
    });

    it('Step 5: reopens and edits the draft permit via PATCH (updating description and contractor)', async () => {
      const patchRes = await requesterAgent
        .patch(`/api/permits/${createdPermitId}`)
        .send({
          version: initialVersion,
          workDescription: 'Updated: Pipeline flange replacement and spool weld with NDT inspection',
          contractorTeam: 'Apex Welding Specialists & NDT Team',
        })
        .expect(200);

      expect(patchRes.body.permit.workDescription).toContain('with NDT inspection');
      expect(patchRes.body.permit.version).toBe(initialVersion + 1);
    });

    it('Step 6 & 7: submits the draft permit for authorization and verifies status is PENDING_APPROVAL', async () => {
      const submitRes = await requesterAgent
        .post(`/api/permits/${createdPermitId}/submit`)
        .send({ comment: 'Ready for Area Owner and Safety reviews' })
        .expect(200);

      expect(submitRes.body.permit.status).toBe(PermitStatus.PENDING_APPROVAL);
    });

    it('Step 8 & 9: opens permit details and verifies immutable audit history has all events', async () => {
      const detailRes = await requesterAgent.get(`/api/permits/${createdPermitId}`).expect(200);
      expect(detailRes.body.permit.status).toBe(PermitStatus.PENDING_APPROVAL);
      expect(detailRes.body.approvals.length).toBe(2); // Area Owner and Safety Officer requirements

      const auditRes = await requesterAgent.get(`/api/permits/${createdPermitId}/audit`).expect(200);
      expect(auditRes.body.timeline).toBeDefined();
      const actions = auditRes.body.timeline.map((t: any) => t.action);
      expect(actions).toContain('create');
      expect(actions).toContain('update');
      expect(actions).toContain('submit');
    });
  });

  describe('Workflow B: Area Owner Approval', () => {
    let permitId: string;

    beforeAll(async () => {
      const plannedStart = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString();

      const createRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Standard Maintenance Ltd',
          workDescription: 'Valve bonnet weld repair',
          plannedStart,
          plannedEnd,
          hazards: ['Open flame'],
          ppe: ['Safety glasses'],
          details: validHotWorkDetails,
        })
        .expect(201);

      permitId = createRes.body.permit.id;
      await requesterAgent.post(`/api/permits/${permitId}/submit`).send({}).expect(200);
    });

    it('Step 1 & 2: Area Owner logs in and queries pendingMyApproval queue', async () => {
      const queueRes = await areaOwnerAgent.get('/api/permits?pendingMyApproval=true').expect(200);
      expect(queueRes.body.items).toBeDefined();
      const found = queueRes.body.items.some((p: any) => p.id === permitId);
      expect(found).toBe(true);
    });

    it('Step 3 & 4: Area Owner opens the submitted permit and reviews allowed actions', async () => {
      const detailRes = await areaOwnerAgent.get(`/api/permits/${permitId}`).expect(200);
      expect(detailRes.body.allowedActions).toContain('approve');
      expect(detailRes.body.allowedActions).toContain('reject');
    });

    it('Step 5, 6 & 7: Area Owner approves the permit and verifies approval record', async () => {
      const approveRes = await areaOwnerAgent
        .post(`/api/permits/${permitId}/approve`)
        .send({ comment: 'Area cleared for hot work. Fire watch briefed.' })
        .expect(200);

      // Four-Eyes Principle: With only 1 of 2 approvals, permit status remains PENDING_APPROVAL
      expect(approveRes.body.permit.status).toBe(PermitStatus.PENDING_APPROVAL);

      const detailRes = await areaOwnerAgent.get(`/api/permits/${permitId}`).expect(200);
      const aoApproval = detailRes.body.approvals.find((a: any) => a.requiredRole === UserRole.AREA_OWNER);
      expect(aoApproval.status).toBe('APPROVED');
      expect(aoApproval.comment).toContain('Area cleared for hot work');
    });
  });

  describe('Workflow C: Safety Officer Approval & Activation', () => {
    let permitId: string;

    beforeAll(async () => {
      // Set plannedStart slightly in the past so activation window is valid
      const plannedStart = new Date(Date.now() - 1000 * 60 * 5).toISOString();
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString();

      const createRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Standard Maintenance Ltd',
          workDescription: 'Safety compliance pipeline cut',
          plannedStart,
          plannedEnd,
          hazards: ['Sparks'],
          ppe: ['Face shield'],
          details: validHotWorkDetails,
        })
        .expect(201);

      permitId = createRes.body.permit.id;
      await requesterAgent.post(`/api/permits/${permitId}/submit`).send({}).expect(200);
      await areaOwnerAgent.post(`/api/permits/${permitId}/approve`).send({ comment: 'AO signoff' }).expect(200);
    });

    it('Step 1 & 2: Safety Officer views approval queue and verifies permit is present', async () => {
      const queueRes = await safetyOfficerAgent.get('/api/permits?pendingMyApproval=true').expect(200);
      expect(queueRes.body.items.some((p: any) => p.id === permitId)).toBe(true);
    });

    it('Step 3, 4 & 5: Safety Officer approves permit, reaching full dual-approval (APPROVED status)', async () => {
      const approveRes = await safetyOfficerAgent
        .post(`/api/permits/${permitId}/approve`)
        .send({ comment: 'Safety measures verified. Approved to issue.' })
        .expect(200);

      // Now both Area Owner and Safety Officer have approved -> APPROVED!
      expect(approveRes.body.permit.status).toBe(PermitStatus.APPROVED);
    });

    it('Step 6: Safety Officer / Requester activates the permit (moves to ACTIVE)', async () => {
      const activateRes = await safetyOfficerAgent
        .post(`/api/permits/${permitId}/activate`)
        .send({ comment: 'Work crew on site, permit active' })
        .expect(200);

      expect(activateRes.body.permit.status).toBe(PermitStatus.ACTIVE);
    });
  });

  describe('Workflow D: Permit Lifecycle (Suspend, Resume, Work Log, Close, Verify)', () => {
    let permitId: string;

    beforeAll(async () => {
      const plannedStart = new Date(Date.now() - 1000 * 60 * 30).toISOString();
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString();

      const createRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Lifecycle Crew',
          workDescription: 'Complete lifecycle verification permit',
          plannedStart,
          plannedEnd,
          hazards: ['Noise', 'Sparks'],
          ppe: ['Ear plugs', 'Safety shoes'],
          details: validHotWorkDetails,
        })
        .expect(201);

      permitId = createRes.body.permit.id;
      await requesterAgent.post(`/api/permits/${permitId}/submit`).send({}).expect(200);
      await areaOwnerAgent.post(`/api/permits/${permitId}/approve`).send({}).expect(200);
      await safetyOfficerAgent.post(`/api/permits/${permitId}/approve`).send({}).expect(200);
      await safetyOfficerAgent.post(`/api/permits/${permitId}/activate`).send({}).expect(200);
    });

    it('Step 1: records operational work logs on the ACTIVE permit', async () => {
      const logRes = await requesterAgent
        .post(`/api/permits/${permitId}/work-logs`)
        .send({ kind: 'NOTE', note: 'Pre-welding atmospheric check clear: 0% LEL' })
        .expect(201);

      expect(logRes.body.workLog).toBeDefined();
      expect(logRes.body.workLog.kind).toBe('NOTE');
      expect(logRes.body.workLog.note).toContain('0% LEL');

      // Verify work log shows in permit details
      const detailRes = await requesterAgent.get(`/api/permits/${permitId}`).expect(200);
      expect(detailRes.body.workLogs.length).toBeGreaterThan(0);
      expect(detailRes.body.workLogs[0].note).toContain('0% LEL');
    });

    it('Step 2: suspends the active permit with a reason', async () => {
      const suspendRes = await safetyOfficerAgent
        .post(`/api/permits/${permitId}/suspend`)
        .send({ comment: 'Inclement weather: lightning detected within 5 miles' })
        .expect(200);

      expect(suspendRes.body.permit.status).toBe(PermitStatus.SUSPENDED);
    });

    it('Step 3: resumes the permit after safety conditions clear', async () => {
      const resumeRes = await safetyOfficerAgent
        .post(`/api/permits/${permitId}/resume`)
        .send({ comment: 'Storm passed. Area re-inspected and safe for resumption.' })
        .expect(200);

      expect(resumeRes.body.permit.status).toBe(PermitStatus.ACTIVE);
    });

    it('Step 4 & 5: completes work and closes permit with mandatory completion notes', async () => {
      // Must reject missing/empty completion notes
      await requesterAgent.post(`/api/permits/${permitId}/close`).send({ completion_notes: '' }).expect(422);

      const closeRes = await requesterAgent
        .post(`/api/permits/${permitId}/close`)
        .send({
          completion_notes: 'Flange welded and torque-checked. Housekeeping complete and fire watch ended.',
          comment: 'Job done',
        })
        .expect(200);

      expect(closeRes.body.permit.status).toBe(PermitStatus.CLOSED);
      expect(closeRes.body.permit.completionNotes).toContain('Flange welded and torque-checked');
    });

    it('Step 6 & 7: Safety Officer verifies closure and signs off into terminal CLOSED_VERIFIED status', async () => {
      const verifyRes = await safetyOfficerAgent
        .post(`/api/permits/${permitId}/verify`)
        .send({ comment: 'Site inspected. Lockouts removed and site returned to operational status.' })
        .expect(200);

      expect(verifyRes.body.permit.status).toBe(PermitStatus.CLOSED_VERIFIED);

      // Verify terminal state: cannot transition further
      await safetyOfficerAgent.post(`/api/permits/${permitId}/activate`).expect(409);
      await safetyOfficerAgent.post(`/api/permits/${permitId}/suspend`).expect(409);
    });
  });

  describe('Workflow E: Rejection Workflow', () => {
    let permitId: string;

    it('Step 1 & 2: creates, submits, and rejects a permit with an audit comment', async () => {
      const plannedStart = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString();

      const createRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Subcontractor X',
          workDescription: 'Grinding near fuel storage',
          plannedStart,
          plannedEnd,
          hazards: ['Explosion risk'],
          ppe: ['Standard PPE'],
          details: validHotWorkDetails,
        })
        .expect(201);

      permitId = createRes.body.permit.id;
      await requesterAgent.post(`/api/permits/${permitId}/submit`).send({}).expect(200);

      // Rejection requires comment
      await areaOwnerAgent.post(`/api/permits/${permitId}/reject`).send({ comment: '' }).expect(422);

      const rejectRes = await areaOwnerAgent
        .post(`/api/permits/${permitId}/reject`)
        .send({ comment: 'Prohibited location: no grinding permitted within 25m of fuel storage' })
        .expect(200);

      expect(rejectRes.body.permit.status).toBe(PermitStatus.REJECTED);
    });

    it('Step 3 & 4: Requester verifies the rejected status and reviews the rejection comment in audit history', async () => {
      const detailRes = await requesterAgent.get(`/api/permits/${permitId}`).expect(200);
      expect(detailRes.body.permit.status).toBe(PermitStatus.REJECTED);

      const auditRes = await requesterAgent.get(`/api/permits/${permitId}/audit`).expect(200);
      const rejectEvent = auditRes.body.timeline.find((t: any) => t.action === 'reject');
      expect(rejectEvent).toBeDefined();
      expect(rejectEvent.comment).toContain('Prohibited location');
    });
  });

  describe('Workflow F: Authorization & Role Barriers', () => {
    let permitId: string;

    beforeAll(async () => {
      const plannedStart = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString();

      const createRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Team Alpha',
          workDescription: 'Auth barrier verification permit',
          plannedStart,
          plannedEnd,
          hazards: ['Heat'],
          ppe: ['Boots'],
          details: validHotWorkDetails,
        })
        .expect(201);

      permitId = createRes.body.permit.id;
      await requesterAgent.post(`/api/permits/${permitId}/submit`).send({}).expect(200);
    });

    it('Requester cannot approve their own permit (Four-Eyes principle barrier)', async () => {
      const res = await requesterAgent.post(`/api/permits/${permitId}/approve`).send({ comment: 'Self approval' });
      expect(res.status).toBe(403);
      expect(['ROLE_NOT_ALLOWED', 'SELF_APPROVAL_FORBIDDEN']).toContain(res.body.error.code);
      expect(res.body.error.message).toMatch(/not authorized|cannot approve/i);
    });

    it('Unauthenticated requests are rejected with 401 Unauthorized', async () => {
      const unauth = request(app);
      await unauth.get('/api/permits').expect(401);
      await unauth.post(`/api/permits/${permitId}/approve`).expect(401);
    });

    it('Requester role cannot execute Area Owner or Safety Officer transitions', async () => {
      await requesterAgent.post(`/api/permits/${permitId}/suspend`).expect(409);
      await requesterAgent.post(`/api/permits/${permitId}/verify`).expect(409);
    });

    it('Area Owner cannot create permits directly (guarded by requireRole middleware with 403)', async () => {
      await areaOwnerAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'AO Team',
          workDescription: 'Illegal direct creation',
          plannedStart: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
          plannedEnd: new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString(),
          details: validHotWorkDetails,
        })
        .expect(403);
    });
  });

  describe('Permit Types: Dynamic Schemas for All 4 Types', () => {
    it('Type 1: CONFINED_SPACE (Entry attendant, rescue plan, and atmospheric test)', async () => {
      const plannedStart = new Date(Date.now() + 1000 * 60 * 30); // 30m in future
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 6);

      const res = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.CONFINED_SPACE,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Tank Entry Specialists',
          workDescription: 'Internal vessel cleaning and sludge removal',
          plannedStart: plannedStart.toISOString(),
          plannedEnd: plannedEnd.toISOString(),
          hazards: ['Toxic gases', 'Oxygen deficiency', 'Engulfment'],
          ppe: ['SCBA', 'Full body harness', 'Multi-gas detector'],
          details: {
            space_id: 'VESSEL-TK-401',
            entry_point: 'Top Manway 24-inch',
            standby_attendant: 'Marcus Attendant',
            rescue_plan: 'RESCUE-PLAN-TK401-REV2',
            ventilation_method: 'forced_mechanical',
            atmosphere_test: {
              o2_pct: 20.8,
              lel_pct: 0,
              h2s_ppm: 0,
              co_ppm: 1,
              tested_at: new Date(plannedStart.getTime() - 1000 * 60 * 15).toISOString(),
            },
          },
        })
        .expect(201);

      expect(res.body.permit.type).toBe(PermitTypeCode.CONFINED_SPACE);
      expect(res.body.permit.details.standby_attendant).toBe('Marcus Attendant');

      // Submit should succeed with valid atmospheric test
      await requesterAgent.post(`/api/permits/${res.body.permit.id}/submit`).send({}).expect(200);
    });

    it('Type 2: WORKING_AT_HEIGHT (Height, fall arrest, scaffold inspection)', async () => {
      const plannedStart = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString();

      const res = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.WORKING_AT_HEIGHT,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Sky High Riggers',
          workDescription: 'Flare stack tip inspection at 45m',
          plannedStart,
          plannedEnd,
          hazards: ['Falling from height', 'Dropped objects', 'High wind'],
          ppe: ['Full body harness with dual lanyards', 'Hard hat with chin strap'],
          details: {
            height_m: 45,
            access_method: 'scaffold',
            fall_arrest_equipment: 'Twin shock-absorbing lanyards anchored to certified lifelines',
            anchor_point_checked: true,
            barricading_below: true,
          },
        })
        .expect(201);

      expect(res.body.permit.type).toBe(PermitTypeCode.WORKING_AT_HEIGHT);
      expect(res.body.permit.details.height_m).toBe(45);

      await requesterAgent.post(`/api/permits/${res.body.permit.id}/submit`).send({}).expect(200);
    });

    it('Type 3: ELECTRICAL_LOTO (Voltage level, isolation points, padlock IDs, zero energy)', async () => {
      const plannedStart = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString();

      const res = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.ELECTRICAL_LOTO,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Substation Electrical Technicians',
          workDescription: '4160V feeder breaker overhaul and bus inspection',
          plannedStart,
          plannedEnd,
          hazards: ['Arc flash', 'Electrocution', 'Stored capacitance'],
          ppe: ['40 cal/cm² Arc Flash Suit', 'Class 4 Insulating Gloves', 'Leather protectors'],
          details: {
            equipment_tag: 'MCC-4160-01',
            voltage_level: '4160V',
            isolation_points: ['Breaker 52-4A Racked Out', 'Control Power Fuse Pulled'],
            lock_numbers: ['LOTO-PADLOCK-01', 'LOTO-PADLOCK-02'],
            tag_numbers: ['TAG-DANGER-401', 'TAG-DANGER-402'],
            earthing_applied: true,
            tested_dead_by: 'Senior Electrical Engineer',
          },
        })
        .expect(201);

      expect(res.body.permit.type).toBe(PermitTypeCode.ELECTRICAL_LOTO);
      expect(res.body.permit.details.voltage_level).toBe('4160V');
      expect(res.body.permit.details.earthing_applied).toBe(true);

      await requesterAgent.post(`/api/permits/${res.body.permit.id}/submit`).send({}).expect(200);
    });
  });

  describe('Workflow G: Role Barriers & Self-Approval Prevention (403 vs 409)', () => {
    it('proves a SAFETY_OFFICER who raised the permit cannot approve it via HTTP (403 SELF_APPROVAL_FORBIDDEN)', async () => {
      // 1. Safety Officer raises a Hot Work permit
      const plannedStart = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();

      const createRes = await safetyOfficerAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Safety Inspection Squad',
          workDescription: 'Safety compliance testing for flare piping',
          plannedStart,
          plannedEnd,
          hazards: ['Flammable gases'],
          ppe: ['Fire resistant suit'],
          details: validHotWorkDetails,
        })
        .expect(201);

      const safetyPermitId = createRes.body.permit.id;
      expect(createRes.body.permit.requesterId).toBeDefined();

      // 2. Safety Officer submits the permit to PENDING_APPROVAL
      await safetyOfficerAgent
        .post(`/api/permits/${safetyPermitId}/submit`)
        .send({})
        .expect(200);

      // 3. Safety Officer attempts to approve their own permit -> must return 403 SELF_APPROVAL_FORBIDDEN
      const selfApproveRes = await safetyOfficerAgent
        .post(`/api/permits/${safetyPermitId}/approve`)
        .send({ comment: 'Safety Officer self-authorizing their own permit' })
        .expect(403);

      expect(selfApproveRes.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
      expect(selfApproveRes.body.error.message).toMatch(/Requesters cannot approve.*their own permits/i);

      // 4. Area Owner can sign off the Area Owner tier
      await areaOwnerAgent
        .post(`/api/permits/${safetyPermitId}/approve`)
        .send({ comment: 'Area owner legitimate signoff' })
        .expect(200);

      // 5. Admin can sign off the Safety Officer tier on their behalf
      await adminAgent
        .post(`/api/permits/${safetyPermitId}/approve`)
        .send({ comment: 'Admin overriding safety tier to prevent self-approval deadlock' })
        .expect(200);

      const finalCheck = await requesterAgent.get(`/api/permits/${safetyPermitId}`).expect(200);
      expect(finalCheck.body.permit.status).toBe(PermitStatus.APPROVED);
    });

    it('returns 403 ROLE_NOT_ALLOWED when role is not authorized for an action from current status', async () => {
      // Create draft permit by requester
      const plannedStart = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();

      const createRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'General Contractors',
          workDescription: 'General repair',
          plannedStart,
          plannedEnd,
          hazards: ['Fire'],
          ppe: ['Boots'],
          details: validHotWorkDetails,
        })
        .expect(201);

      const pId = createRes.body.permit.id;
      await requesterAgent.post(`/api/permits/${pId}/submit`).send({}).expect(200);

      // Requester attempts to approve a permit in PENDING_APPROVAL -> 403 ROLE_NOT_ALLOWED
      const reqApproveRes = await requesterAgent
        .post(`/api/permits/${pId}/approve`)
        .send({ comment: 'Requester cannot approve' })
        .expect(403);

      expect(reqApproveRes.body.error.code).toBe('ROLE_NOT_ALLOWED');
    });

    it('returns 409 ILLEGAL_TRANSITION strictly for invalid lifecycle state machine transitions', async () => {
      // Create draft permit
      const plannedStart = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const plannedEnd = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();

      const createRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'General Contractors',
          workDescription: 'Illegal transition test',
          plannedStart,
          plannedEnd,
          hazards: ['Fire'],
          ppe: ['Boots'],
          details: validHotWorkDetails,
        })
        .expect(201);

      const pId = createRes.body.permit.id;

      // Attempt to activate DRAFT directly -> 409 ILLEGAL_TRANSITION
      const directActRes = await requesterAgent
        .post(`/api/permits/${pId}/activate`)
        .send({})
        .expect(409);

      expect(directActRes.body.error.code).toBe('ILLEGAL_TRANSITION');
    });
  });
});
