import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { seedDatabase } from '../../db/seed.js';
import { getPool, closeDbConnection } from '../../db/client.js';
import { PermitStatus, PermitTypeCode } from '@ptw/shared';

describe('Stage 1 Submission Audit Regressions (I12, I10, D1/I6, C7, K1)', () => {
  let pool: ReturnType<typeof getPool>;
  let requesterAgent: ReturnType<typeof request.agent>;
  let areaOwnerAgent: ReturnType<typeof request.agent>;
  let safetyOfficerAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;

  let areaOwnerId: string;
  let plantId: string;
  let areaId: string;
  let equipmentId: string;

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

    const usersRes = await pool.query('SELECT id, email FROM users');
    areaOwnerId = usersRes.rows.find((u) => u.email === 'area.owner@cmms.local')!.id;

    const locRes = await pool.query(
      `SELECT e.id as equipment_id, e.area_id, a.plant_id
       FROM equipment e
       JOIN areas a ON a.id = e.area_id
       WHERE a.owner_id = $1 AND e.is_active = true AND a.is_active = true
       LIMIT 1`,
      [areaOwnerId]
    );
    plantId = locRes.rows[0].plant_id;
    areaId = locRes.rows[0].area_id;
    equipmentId = locRes.rows[0].equipment_id;
  });

  afterAll(async () => {
    await seedDatabase(pool);
    await closeDbConnection();
  });

  async function createPermitFor(
    agent: ReturnType<typeof request.agent>,
    overrides: Partial<{
      type: string;
      status: PermitStatus;
      plannedStart: string;
      plannedEnd: string;
      details: Record<string, unknown>;
    }> = {}
  ): Promise<string> {
    const start =
      overrides.plannedStart ?? new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const end =
      overrides.plannedEnd ?? new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

    const res = await agent
      .post('/api/permits')
      .send({
        type: overrides.type ?? PermitTypeCode.HOT_WORK,
        plantId,
        areaId,
        equipmentId,
        contractorTeam: 'Audit Verification Team',
        workDescription: 'Stage 1 regression test permit',
        plannedStart: start,
        plannedEnd: end,
        hazards: ['Heat'],
        ppe: ['Gloves'],
        details: overrides.details ?? {
          ...validHotWorkDetails,
          gas_test: {
            lel_pct: 0,
            o2_pct: 20.9,
            tested_at: new Date().toISOString(),
          },
        },
      })
      .expect(201);

    return res.body.permit.id as string;
  }

  describe('I12: Shared UUID validation across ALL :id routes', () => {
    it('returns 422 INVALID_ID (never 500) for "not-a-uuid" on every permit, work-log, transition, and admin :id endpoint', async () => {
      const permitRoutes: Array<{
        method: 'get' | 'post' | 'patch';
        path: string;
        agent: ReturnType<typeof request.agent>;
        body?: Record<string, unknown>;
      }> = [
        { method: 'get', path: '/api/permits/not-a-uuid', agent: requesterAgent },
        { method: 'patch', path: '/api/permits/not-a-uuid', agent: requesterAgent, body: { version: 1 } },
        { method: 'get', path: '/api/permits/not-a-uuid/audit', agent: requesterAgent },
        {
          method: 'post',
          path: '/api/permits/not-a-uuid/work-logs',
          agent: requesterAgent,
          body: { kind: 'NOTE', note: 'log entry' },
        },
        { method: 'post', path: '/api/permits/not-a-uuid/submit', agent: requesterAgent, body: {} },
        { method: 'post', path: '/api/permits/not-a-uuid/approve', agent: areaOwnerAgent, body: {} },
        {
          method: 'post',
          path: '/api/permits/not-a-uuid/reject',
          agent: areaOwnerAgent,
          body: { comment: 'Invalid hazard controls' },
        },
        { method: 'post', path: '/api/permits/not-a-uuid/activate', agent: requesterAgent, body: {} },
        {
          method: 'post',
          path: '/api/permits/not-a-uuid/suspend',
          agent: safetyOfficerAgent,
          body: { comment: 'Rain hazard' },
        },
        { method: 'post', path: '/api/permits/not-a-uuid/resume', agent: safetyOfficerAgent, body: {} },
        {
          method: 'post',
          path: '/api/permits/not-a-uuid/close',
          agent: requesterAgent,
          body: { completionNotes: 'Completed work safely' },
        },
        { method: 'post', path: '/api/permits/not-a-uuid/verify', agent: safetyOfficerAgent, body: {} },
        {
          method: 'post',
          path: '/api/permits/not-a-uuid/cancel',
          agent: requesterAgent,
          body: { comment: 'No longer required' },
        },
      ];

      const adminRoutes: Array<{
        method: 'get' | 'post' | 'patch';
        path: string;
        agent: ReturnType<typeof request.agent>;
        body?: Record<string, unknown>;
      }> = [
        { method: 'patch', path: '/api/admin/users/not-a-uuid', agent: adminAgent, body: { name: 'X' } },
        {
          method: 'post',
          path: '/api/admin/users/not-a-uuid/reset-password',
          agent: adminAgent,
          body: { password: 'ValidPassword2026!' },
        },
        { method: 'patch', path: '/api/admin/plants/not-a-uuid', agent: adminAgent, body: { name: 'X' } },
        { method: 'patch', path: '/api/admin/areas/not-a-uuid', agent: adminAgent, body: { name: 'X' } },
        { method: 'patch', path: '/api/admin/equipment/not-a-uuid', agent: adminAgent, body: { name: 'X' } },
      ];

      for (const route of [...permitRoutes, ...adminRoutes]) {
        const res = await (route.agent as any)[route.method](route.path).send(route.body);
        expect(res.status, `${route.method.toUpperCase()} ${route.path} should return 422`).toBe(422);
        expect(res.body?.error?.code, `${route.method.toUpperCase()} ${route.path} should return INVALID_ID`).toBe(
          'INVALID_ID'
        );
      }
    });
  });

  describe('I10: Body size limits (413) & malformed client JSON handling (400/422, never 500)', () => {
    it('returns 413 PAYLOAD_TOO_LARGE when JSON body exceeds express.json limit', async () => {
      const hugeText = 'X'.repeat(250 * 1024);
      const res = await requesterAgent.post('/api/permits').send({
        type: PermitTypeCode.HOT_WORK,
        plantId,
        areaId,
        equipmentId,
        contractorTeam: 'Oversized Payload Team',
        workDescription: hugeText,
        plannedStart: new Date(Date.now() + 3600000).toISOString(),
        plannedEnd: new Date(Date.now() + 7200000).toISOString(),
      });

      expect(res.status).toBe(413);
      expect(res.body?.error?.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('returns 400 MALFORMED_JSON envelope for broken JSON and never 500 for non-object JSON primitives', async () => {
      const brokenRes = await requesterAgent
        .post('/api/permits')
        .set('Content-Type', 'application/json')
        .send('{"type": "HOT_WORK", broken');
      expect(brokenRes.status).toBe(400);
      expect(brokenRes.body?.error?.code).toBe('MALFORMED_JSON');

      const primitiveRes = await requesterAgent
        .post('/api/permits')
        .set('Content-Type', 'application/json')
        .send('"just-a-string"');
      expect([400, 422]).toContain(primitiveRes.status);
      expect(primitiveRes.body?.error?.code).toBeDefined();
    });
  });

  describe('D1/I6: Strict requester ownership on submit/activate/close & verify separation of duties', () => {
    it('enforces full role x action x ownership matrix across submit, activate, suspend, resume, approve, close, verify', async () => {
      // Case 1: Permit owned by primary REQUESTER, contrasted against non-owner SAFETY_OFFICER and AREA_OWNER
      const pReqId = await createPermitFor(requesterAgent);

      const submitOtherSo = await safetyOfficerAgent.post(`/api/permits/${pReqId}/submit`).send({});
      expect(submitOtherSo.status).toBe(403);
      expect(submitOtherSo.body.error.code).toBe('NOT_PERMIT_OWNER');

      const submitAo = await areaOwnerAgent.post(`/api/permits/${pReqId}/submit`).send({});
      expect(submitAo.status).toBe(403);
      expect(submitAo.body.error.code).toBe('ROLE_NOT_ALLOWED');

      // owner requester submits -> 200
      await requesterAgent.post(`/api/permits/${pReqId}/submit`).send({}).expect(200);

      // approve: requester blocked; areaOwner & safetyOfficer succeed
      const appReq = await requesterAgent.post(`/api/permits/${pReqId}/approve`).send({});
      expect(appReq.status).toBe(403);

      await areaOwnerAgent.post(`/api/permits/${pReqId}/approve`).send({}).expect(200);
      await safetyOfficerAgent.post(`/api/permits/${pReqId}/approve`).send({}).expect(200);

      // activate: non-owner safetyOfficer -> 403 NOT_PERMIT_OWNER; areaOwner -> 403 ROLE_NOT_ALLOWED; owner -> 200
      const actOtherSo = await safetyOfficerAgent.post(`/api/permits/${pReqId}/activate`).send({});
      expect(actOtherSo.status).toBe(403);
      expect(actOtherSo.body.error.code).toBe('NOT_PERMIT_OWNER');

      const actAo = await areaOwnerAgent.post(`/api/permits/${pReqId}/activate`).send({});
      expect(actAo.status).toBe(403);
      expect(actAo.body.error.code).toBe('ROLE_NOT_ALLOWED');

      await requesterAgent.post(`/api/permits/${pReqId}/activate`).send({}).expect(200);

      // suspend & resume: requester & areaOwner -> 403 ROLE_NOT_ALLOWED; safetyOfficer -> 200
      const suspReq = await requesterAgent
        .post(`/api/permits/${pReqId}/suspend`)
        .send({ comment: 'Unauthorized suspend' });
      expect(suspReq.status).toBe(403);
      expect(suspReq.body.error.code).toBe('ROLE_NOT_ALLOWED');

      const suspAo = await areaOwnerAgent
        .post(`/api/permits/${pReqId}/suspend`)
        .send({ comment: 'Unauthorized suspend' });
      expect(suspAo.status).toBe(403);
      expect(suspAo.body.error.code).toBe('ROLE_NOT_ALLOWED');

      await safetyOfficerAgent
        .post(`/api/permits/${pReqId}/suspend`)
        .send({ comment: 'Wind gusts above limit' })
        .expect(200);

      const resReq = await requesterAgent.post(`/api/permits/${pReqId}/resume`).send({});
      expect(resReq.status).toBe(403);
      expect(resReq.body.error.code).toBe('ROLE_NOT_ALLOWED');

      const resAo = await areaOwnerAgent.post(`/api/permits/${pReqId}/resume`).send({});
      expect(resAo.status).toBe(403);
      expect(resAo.body.error.code).toBe('ROLE_NOT_ALLOWED');

      await safetyOfficerAgent.post(`/api/permits/${pReqId}/resume`).send({}).expect(200);

      // close: non-owner safetyOfficer -> 403 NOT_PERMIT_OWNER; areaOwner -> 403 ROLE_NOT_ALLOWED; owner -> 200
      const closeOtherSo = await safetyOfficerAgent
        .post(`/api/permits/${pReqId}/close`)
        .send({ completionNotes: 'Safety officer trying to close other user permit' });
      expect(closeOtherSo.status).toBe(403);
      expect(closeOtherSo.body.error.code).toBe('NOT_PERMIT_OWNER');

      const closeAo = await areaOwnerAgent
        .post(`/api/permits/${pReqId}/close`)
        .send({ completionNotes: 'Area owner cannot close' });
      expect(closeAo.status).toBe(403);
      expect(closeAo.body.error.code).toBe('ROLE_NOT_ALLOWED');

      await requesterAgent
        .post(`/api/permits/${pReqId}/close`)
        .send({ completionNotes: 'Owner closed permit safely' })
        .expect(200);

      // verify: requester & areaOwner -> 403 ROLE_NOT_ALLOWED; independent safetyOfficer -> 200
      const verReq = await requesterAgent.post(`/api/permits/${pReqId}/verify`).send({});
      expect(verReq.status).toBe(403);

      const verAo = await areaOwnerAgent.post(`/api/permits/${pReqId}/verify`).send({});
      expect(verAo.status).toBe(403);
      expect(verAo.body.error.code).toBe('ROLE_NOT_ALLOWED');

      const verSo = await safetyOfficerAgent.post(`/api/permits/${pReqId}/verify`).send({}).expect(200);
      expect(verSo.body.permit.status).toBe(PermitStatus.CLOSED_VERIFIED);

      // Case 2: SAFETY_OFFICER owns permit -> non-owner REQUESTER is blocked (403 NOT_PERMIT_OWNER) on submit/activate/close,
      // while SAFETY_OFFICER (owner) can submit/activate/close their own permit, cannot verify own permit, and ADMIN verifies!
      const pSoId = await createPermitFor(safetyOfficerAgent);

      const submitNonOwnerReq = await requesterAgent.post(`/api/permits/${pSoId}/submit`).send({});
      expect(submitNonOwnerReq.status).toBe(403);
      expect(submitNonOwnerReq.body.error.code).toBe('NOT_PERMIT_OWNER');

      await safetyOfficerAgent.post(`/api/permits/${pSoId}/submit`).send({}).expect(200);
      await areaOwnerAgent.post(`/api/permits/${pSoId}/approve`).send({}).expect(200);
      await adminAgent.post(`/api/permits/${pSoId}/approve`).send({}).expect(200);

      const activateNonOwnerReq = await requesterAgent.post(`/api/permits/${pSoId}/activate`).send({});
      expect(activateNonOwnerReq.status).toBe(403);
      expect(activateNonOwnerReq.body.error.code).toBe('NOT_PERMIT_OWNER');

      await safetyOfficerAgent.post(`/api/permits/${pSoId}/activate`).send({}).expect(200);

      const closeNonOwnerReq = await requesterAgent
        .post(`/api/permits/${pSoId}/close`)
        .send({ completionNotes: 'Non-owner requester cannot close' });
      expect(closeNonOwnerReq.status).toBe(403);
      expect(closeNonOwnerReq.body.error.code).toBe('NOT_PERMIT_OWNER');

      await safetyOfficerAgent
        .post(`/api/permits/${pSoId}/close`)
        .send({ completionNotes: 'SO closed their own permit' })
        .expect(200);

      const selfVerifySo = await safetyOfficerAgent.post(`/api/permits/${pSoId}/verify`).send({});
      expect(selfVerifySo.status).toBe(403);

      await adminAgent.post(`/api/permits/${pSoId}/verify`).send({}).expect(200);

      // Case 3: ADMIN closes requester's permit (full access), then SAME ADMIN cannot verify it (separation of duties)
      const pAdminFlowId = await createPermitFor(requesterAgent);
      await adminAgent.post(`/api/permits/${pAdminFlowId}/submit`).send({}).expect(200);
      await areaOwnerAgent.post(`/api/permits/${pAdminFlowId}/approve`).send({}).expect(200);
      await safetyOfficerAgent.post(`/api/permits/${pAdminFlowId}/approve`).send({}).expect(200);
      await adminAgent.post(`/api/permits/${pAdminFlowId}/activate`).send({}).expect(200);
      await adminAgent
        .post(`/api/permits/${pAdminFlowId}/close`)
        .send({ completionNotes: 'Admin closed permit on requester behalf' })
        .expect(200);

      // Same admin detail response should NOT advertise 'verify' in allowedActions
      const detailForSameAdmin = await adminAgent.get(`/api/permits/${pAdminFlowId}`).expect(200);
      expect(detailForSameAdmin.body.allowedActions).not.toContain('verify');

      const sameAdminVerify = await adminAgent.post(`/api/permits/${pAdminFlowId}/verify`).send({});
      expect(sameAdminVerify.status).toBe(403);
      expect(['DUTIES_SEPARATION_VIOLATION', 'SELF_APPROVAL_FORBIDDEN']).toContain(
        sameAdminVerify.body.error.code
      );

      // Independent Safety Officer (neither requester nor closer) verifies cleanly
      const indSoVerify = await safetyOfficerAgent
        .post(`/api/permits/${pAdminFlowId}/verify`)
        .send({})
        .expect(200);
      expect(indSoVerify.body.permit.status).toBe(PermitStatus.CLOSED_VERIFIED);
    });
  });

  describe('C7: Mandatory trimmed comments/completionNotes server-side', () => {
    it('rejects missing/whitespace/non-string comments on reject/suspend/cancel and missing completionNotes on close', async () => {
      const p1 = await createPermitFor(requesterAgent);
      await requesterAgent.post(`/api/permits/${p1}/submit`).send({}).expect(200);

      const rejBlank = await areaOwnerAgent
        .post(`/api/permits/${p1}/reject`)
        .send({ comment: '   \n\t  ' });
      expect(rejBlank.status).toBe(422);
      expect(rejBlank.body.error.code).toBe('MISSING_COMMENT');

      const rejNonStr = await areaOwnerAgent.post(`/api/permits/${p1}/reject`).send({ comment: 12345 });
      expect(rejNonStr.status).toBe(422);

      const pCancel = await createPermitFor(requesterAgent);
      const canMissing = await requesterAgent.post(`/api/permits/${pCancel}/cancel`).send({});
      expect(canMissing.status).toBe(422);
      expect(canMissing.body.error.code).toBe('MISSING_COMMENT');

      const canBlank = await requesterAgent
        .post(`/api/permits/${pCancel}/cancel`)
        .send({ comment: '   ' });
      expect(canBlank.status).toBe(422);
      expect(canBlank.body.error.code).toBe('MISSING_COMMENT');

      await areaOwnerAgent.post(`/api/permits/${p1}/approve`).send({}).expect(200);
      await safetyOfficerAgent.post(`/api/permits/${p1}/approve`).send({}).expect(200);
      await requesterAgent.post(`/api/permits/${p1}/activate`).send({}).expect(200);

      const suspBlank = await safetyOfficerAgent
        .post(`/api/permits/${p1}/suspend`)
        .send({ comment: '   ' });
      expect(suspBlank.status).toBe(422);
      expect(suspBlank.body.error.code).toBe('MISSING_COMMENT');

      const closeBlank = await requesterAgent
        .post(`/api/permits/${p1}/close`)
        .send({ completionNotes: '   ' });
      expect(closeBlank.status).toBe(422);
      expect(closeBlank.body.error.code).toBe('MISSING_COMPLETION_NOTES');

      const closeOnlyComment = await requesterAgent
        .post(`/api/permits/${p1}/close`)
        .send({ comment: 'Just a comment, no completion notes' });
      expect(closeOnlyComment.status).toBe(422);
      expect(closeOnlyComment.body.error.code).toBe('MISSING_COMPLETION_NOTES');
    });
  });

  describe('K1: Gas safety thresholds enforced strictly on submit with 422 UNSAFE_ATMOSPHERE', () => {
    it('allows unsafe gas readings in DRAFT create/update, rejects on submit with offending readings, and succeeds once safe', async () => {
      const unsafeHotWork = {
        ...validHotWorkDetails,
        gas_test: {
          lel_pct: 12.5,
          o2_pct: 18.0,
          tested_at: new Date().toISOString(),
        },
      };

      const draftId = await createPermitFor(requesterAgent, {
        type: PermitTypeCode.HOT_WORK,
        details: unsafeHotWork,
      });

      const unsafeSubmit = await requesterAgent.post(`/api/permits/${draftId}/submit`).send({});
      expect(unsafeSubmit.status).toBe(422);
      expect(unsafeSubmit.body.error.code).toBe('UNSAFE_ATMOSPHERE');
      expect(unsafeSubmit.body.error.details).toBeDefined();
      expect(JSON.stringify(unsafeSubmit.body.error.details)).toMatch(/lel_pct|LEL/i);
      expect(JSON.stringify(unsafeSubmit.body.error.details)).toMatch(/o2_pct|O2/i);

      const current = await requesterAgent.get(`/api/permits/${draftId}`).expect(200);
      await requesterAgent
        .patch(`/api/permits/${draftId}`)
        .send({
          version: current.body.permit.version,
          details: {
            ...validHotWorkDetails,
            gas_test: {
              lel_pct: 0,
              o2_pct: 20.9,
              tested_at: new Date().toISOString(),
            },
          },
        })
        .expect(200);

      await requesterAgent.post(`/api/permits/${draftId}/submit`).send({}).expect(200);

      const csStart = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const csEnd = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      const csId = await createPermitFor(requesterAgent, {
        type: PermitTypeCode.CONFINED_SPACE,
        plannedStart: csStart,
        plannedEnd: csEnd,
        details: {
          space_id: 'CS-101',
          entry_point: 'Top Manway',
          atmosphere_test: {
            o2_pct: 24.0,
            lel_pct: 0,
            h2s_ppm: 15,
            co_ppm: 40,
            tested_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          },
          standby_attendant: 'Rohan Patil',
          rescue_plan: 'Tripod + SCBA team',
          ventilation_method: 'forced_mechanical',
        },
      });

      const csSubmit = await requesterAgent.post(`/api/permits/${csId}/submit`).send({});
      expect(csSubmit.status).toBe(422);
      expect(csSubmit.body.error.code).toBe('UNSAFE_ATMOSPHERE');
      expect(JSON.stringify(csSubmit.body.error.details)).toMatch(/h2s_ppm|H2S/i);
      expect(JSON.stringify(csSubmit.body.error.details)).toMatch(/co_ppm|CO/i);
    });
  });
});
