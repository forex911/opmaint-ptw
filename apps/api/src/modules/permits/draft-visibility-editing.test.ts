import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { seedDatabase } from '../../db/seed.js';
import { getPool, closeDbConnection } from '../../db/client.js';
import { PermitStatus, PermitTypeCode, UserRole } from '@ptw/shared';

describe('Hotfix Regressions: Bug A (Draft Visibility) & Bug B (Full Draft Editing & Submit)', () => {
  let pool: ReturnType<typeof getPool>;

  let requesterAgent: ReturnType<typeof request.agent>;
  let otherRequesterAgent: ReturnType<typeof request.agent>;
  let areaOwnerAgent: ReturnType<typeof request.agent>;
  let safetyOfficerAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;

  let otherRequesterId: string;
  let areaOwnerId: string;
  let plant1Id: string;
  let area1Id: string;
  let eq1Id: string;
  let plant2Id: string;
  let area2Id: string;
  let eq2Id: string;
  let seedDraftId: string;

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

    // Create a scratch second REQUESTER used only for read/404 probes (no permit/audit FK references)
    const otherEmail = `hotfix.req2.${Date.now()}@cmms.local`;
    const otherRes = await adminAgent
      .post('/api/admin/users')
      .send({
        name: 'Other Requester',
        email: otherEmail,
        password: 'ValidPassword2026!',
        role: UserRole.REQUESTER,
      })
      .expect(201);
    otherRequesterId = otherRes.body.user.id;

    otherRequesterAgent = request.agent(app);
    await otherRequesterAgent
      .post('/api/auth/login')
      .send({ email: otherEmail, password: 'ValidPassword2026!' })
      .expect(200);

    const aoUserRes = await pool.query(`SELECT id FROM users WHERE email = 'area.owner@cmms.local'`);
    areaOwnerId = aoUserRes.rows[0].id;

    const eqRes1 = await pool.query(
      `SELECT e.id AS equipment_id, e.area_id, a.plant_id
       FROM equipment e
       JOIN areas a ON a.id = e.area_id
       WHERE a.owner_id = $1 AND e.is_active = true AND a.is_active = true
       ORDER BY e.tag ASC LIMIT 1`,
      [areaOwnerId]
    );
    plant1Id = eqRes1.rows[0].plant_id;
    area1Id = eqRes1.rows[0].area_id;
    eq1Id = eqRes1.rows[0].equipment_id;

    const eqRes2 = await pool.query(
      `SELECT e.id AS equipment_id, e.area_id, a.plant_id
       FROM equipment e
       JOIN areas a ON a.id = e.area_id
       WHERE a.plant_id != $1 AND e.is_active = true AND a.is_active = true
       ORDER BY e.tag ASC LIMIT 1`,
      [plant1Id]
    );
    plant2Id = eqRes2.rows[0].plant_id;
    area2Id = eqRes2.rows[0].area_id;
    eq2Id = eqRes2.rows[0].equipment_id;

    const draftRow = await pool.query(`SELECT id FROM permits WHERE permit_no = 'PTW-2026-0007'`);
    seedDraftId = draftRow.rows[0].id;
  });

  afterAll(async () => {
    if (otherRequesterId) {
      await pool.query('DELETE FROM users WHERE id = $1', [otherRequesterId]).catch(() => {});
    }
    await seedDatabase(pool);
    await closeDbConnection();
  });

  describe('BUG A — DRAFT Visibility Restriction (Amending D-020)', () => {
    it('hides seeded DRAFT PTW-2026-0007 from non-owners/non-admins across list, search, detail, stats, timeline, and mutations', async () => {
      // Owner (requester) and ADMIN see PTW-2026-0007
      for (const authorized of [requesterAgent, adminAgent]) {
        const listRes = await authorized.get('/api/permits?status=DRAFT&limit=100').expect(200);
        expect(listRes.body.items.some((p: any) => p.permitNo === 'PTW-2026-0007')).toBe(true);

        const searchRes = await authorized.get('/api/permits?search=PTW-2026-0007').expect(200);
        expect(searchRes.body.items.some((p: any) => p.id === seedDraftId)).toBe(true);

        const detailRes = await authorized.get(`/api/permits/${seedDraftId}`).expect(200);
        expect(detailRes.body.permit.permitNo).toBe('PTW-2026-0007');

        const auditRes = await authorized.get(`/api/permits/${seedDraftId}/audit`).expect(200);
        expect(Array.isArray(auditRes.body.timeline)).toBe(true);
      }

      // Non-owners (otherRequester, areaOwner, safetyOfficer) MUST NOT see PTW-2026-0007 anywhere
      for (const unauthorized of [otherRequesterAgent, areaOwnerAgent, safetyOfficerAgent]) {
        const listRes = await unauthorized.get('/api/permits?status=DRAFT&limit=100').expect(200);
        expect(listRes.body.items.some((p: any) => p.permitNo === 'PTW-2026-0007')).toBe(false);
        expect(listRes.body.pagination.total).toBe(0);

        const searchRes = await unauthorized.get('/api/permits?search=PTW-2026-0007').expect(200);
        expect(searchRes.body.items).toHaveLength(0);
        expect(searchRes.body.pagination.total).toBe(0);

        await unauthorized.get(`/api/permits/${seedDraftId}`).expect(404);
        await unauthorized.get(`/api/permits/${seedDraftId}/audit`).expect(404);

        const statsRes = await unauthorized.get('/api/permits/stats').expect(200);
        expect(statsRes.body.byStatus.DRAFT).toBe(0);

        // Mutations on another user's draft also return 404 (never reveal existence or status)
        await unauthorized
          .patch(`/api/permits/${seedDraftId}`)
          .send({ version: 1, workDescription: 'Probe' })
          .expect(404);
        await unauthorized.post(`/api/permits/${seedDraftId}/submit`).send({}).expect(404);
        await unauthorized.post(`/api/permits/${seedDraftId}/approve`).send({}).expect(404);
        await unauthorized
          .post(`/api/permits/${seedDraftId}/cancel`)
          .send({ comment: 'Probe' })
          .expect(404);
        await unauthorized
          .post(`/api/permits/${seedDraftId}/work-logs`)
          .send({ kind: 'NOTE', note: 'Probe' })
          .expect(404);
      }
    });

    it('hides newly created draft from non-owners across all roles x surfaces, then exposes it to ALL roles once submitted', async () => {
      const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const end = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      const uniqueTag = `VisibilityToken-${Date.now()}`;

      const createRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId: plant1Id,
          areaId: area1Id,
          equipmentId: eq1Id,
          contractorTeam: 'Visibility Crew',
          workDescription: `${uniqueTag} Draft inspection`,
          plannedStart: start,
          plannedEnd: end,
          hazards: ['Sparks'],
          ppe: ['Hard Hat'],
          precautions: ['Perimeter barricaded'],
          details: {
            hot_work_type: 'welding',
            fire_watch_assigned: true,
            extinguisher_type: 'CO2 5kg',
            combustibles_cleared_radius_m: 15,
            gas_test: { lel_pct: 0, o2_pct: 20.9, tested_at: new Date().toISOString() },
          },
        })
        .expect(201);

      const draftId = createRes.body.permit.id;
      const draftNo = createRes.body.permit.permitNo;

      const reqStatsBefore = await requesterAgent.get('/api/permits/stats').expect(200);
      const adminStatsBefore = await adminAgent.get('/api/permits/stats').expect(200);
      const aoStatsBefore = await areaOwnerAgent.get('/api/permits/stats').expect(200);
      const soStatsBefore = await safetyOfficerAgent.get('/api/permits/stats').expect(200);
      const otherReqStatsBefore = await otherRequesterAgent.get('/api/permits/stats').expect(200);

      expect(reqStatsBefore.body.byStatus.DRAFT).toBeGreaterThanOrEqual(1);
      expect(adminStatsBefore.body.byStatus.DRAFT).toBeGreaterThanOrEqual(1);
      expect(aoStatsBefore.body.byStatus.DRAFT).toBe(0);
      expect(soStatsBefore.body.byStatus.DRAFT).toBe(0);
      expect(otherReqStatsBefore.body.byStatus.DRAFT).toBe(0);
      expect(adminStatsBefore.body.total).toBeGreaterThan(aoStatsBefore.body.total);

      // Search & detail while DRAFT
      for (const unauth of [otherRequesterAgent, areaOwnerAgent, safetyOfficerAgent]) {
        const searchRes = await unauth.get(`/api/permits?search=${encodeURIComponent(uniqueTag)}`).expect(200);
        expect(searchRes.body.items).toHaveLength(0);
        expect(searchRes.body.pagination.total).toBe(0);
        await unauth.get(`/api/permits/${draftId}`).expect(404);
        await unauth.get(`/api/permits/${draftId}/audit`).expect(404);
      }

      // Submit draft -> PENDING_APPROVAL
      await requesterAgent.post(`/api/permits/${draftId}/submit`).send({}).expect(200);

      // Now ALL 5 roles can view list, search, detail, stats, and timeline!
      for (const viewer of [
        requesterAgent,
        otherRequesterAgent,
        areaOwnerAgent,
        safetyOfficerAgent,
        adminAgent,
      ]) {
        const searchRes = await viewer.get(`/api/permits?search=${encodeURIComponent(draftNo)}`).expect(200);
        expect(searchRes.body.items.some((p: any) => p.id === draftId)).toBe(true);

        const detailRes = await viewer.get(`/api/permits/${draftId}`).expect(200);
        expect(detailRes.body.permit.status).toBe(PermitStatus.PENDING_APPROVAL);

        const auditRes = await viewer.get(`/api/permits/${draftId}/audit`).expect(200);
        expect(auditRes.body.timeline.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('BUG B — Complete Draft Editing & Submit Field-Level Errors', () => {
    it('offers submit on partial draft, edits EVERY editable field across multiple versioned saves, validates per-field on incomplete submit, then submits cleanly', async () => {
      const start1 = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const end1 = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

      // 1. Create partial draft without equipmentId and incomplete details, with precautions
      const createRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: PermitTypeCode.HOT_WORK,
          plantId: plant1Id,
          areaId: area1Id,
          contractorTeam: 'Draft Team v1',
          workDescription: 'Partial draft v1',
          plannedStart: start1,
          plannedEnd: end1,
          hazards: ['Sparks'],
          ppe: ['Hard Hat'],
          precautions: ['Initial precaution 1'],
          details: { hot_work_type: 'welding' },
        })
        .expect(201);

      const permitId = createRes.body.permit.id;
      expect(createRes.body.permit.version).toBe(1);
      expect(createRes.body.permit.precautions).toEqual(['Initial precaution 1']);

      // 2. Owner GET /api/permits/:id MUST advertise 'submit' in allowedActions even for partial draft
      const detail1 = await requesterAgent.get(`/api/permits/${permitId}`).expect(200);
      expect(detail1.body.allowedActions).toContain('submit');
      expect(detail1.body.permit.precautions).toEqual(['Initial precaution 1']);

      // 3. Submitting partial draft (missing equipmentId & incomplete details) returns 422 with per-field paths
      const incompleteSubmit = await requesterAgent.post(`/api/permits/${permitId}/submit`).send({});
      expect(incompleteSubmit.status).toBe(422);
      expect(incompleteSubmit.body.error.code).toBe('VALIDATION_ERROR');
      expect(incompleteSubmit.body.error.details.equipmentId).toBeDefined();
      expect(incompleteSubmit.body.error.details.fire_watch_assigned).toBeDefined();
      expect(incompleteSubmit.body.error.details.extinguisher_type).toBeDefined();

      // 4. PATCH Save #1 (version 1 -> 2): change type, locations, times, description, contractor, hazards, ppe, precautions, partial details
      const start2 = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
      const end2 = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

      const patch1 = await requesterAgent
        .patch(`/api/permits/${permitId}`)
        .send({
          version: 1,
          type: PermitTypeCode.WORKING_AT_HEIGHT,
          plantId: plant2Id,
          areaId: area2Id,
          equipmentId: eq2Id,
          contractorTeam: 'Draft Team v2',
          workDescription: 'Edited full draft v2',
          plannedStart: start2,
          plannedEnd: end2,
          hazards: ['Fall Hazard', 'Wind'],
          ppe: ['Full Body Harness', 'Helmet'],
          precautions: ['Scaffold inspected', 'Exclusion zone marked'],
          details: { height_m: 12 },
        });
      expect(patch1.status).toBe(200);
      expect(patch1.body.permit.version).toBe(2);
      expect(patch1.body.permit.type).toBe(PermitTypeCode.WORKING_AT_HEIGHT);
      expect(patch1.body.permit.plantId).toBe(plant2Id);
      expect(patch1.body.permit.areaId).toBe(area2Id);
      expect(patch1.body.permit.equipmentId).toBe(eq2Id);
      expect(patch1.body.permit.hazards).toEqual(['Fall Hazard', 'Wind']);
      expect(patch1.body.permit.ppe).toEqual(['Full Body Harness', 'Helmet']);
      expect(patch1.body.permit.precautions).toEqual(['Scaffold inspected', 'Exclusion zone marked']);

      // 5. Non-owner cannot PATCH or submit the draft (returns 404)
      await areaOwnerAgent
        .patch(`/api/permits/${permitId}`)
        .send({ version: 2, workDescription: 'Hijack' })
        .expect(404);
      await safetyOfficerAgent.post(`/api/permits/${permitId}/submit`).send({}).expect(404);

      // 6. PATCH Save #2 (version 2 -> 3): change back/complete WORKING_AT_HEIGHT details cleanly
      const patch2 = await requesterAgent
        .patch(`/api/permits/${permitId}`)
        .send({
          version: 2,
          type: PermitTypeCode.HOT_WORK,
          contractorTeam: 'Draft Team v3 Final',
          workDescription: 'Final ready hot work description',
          hazards: ['Flammable Vapors', 'Sparks'],
          ppe: ['Welding Helmet', 'FRC'],
          precautions: ['Area inspected and cleared of debris prior to start'],
          details: {
            hot_work_type: 'cutting',
            fire_watch_assigned: true,
            extinguisher_type: 'DCP 9kg',
            combustibles_cleared_radius_m: 12,
            gas_test: {
              lel_pct: 0,
              o2_pct: 20.9,
              tested_at: new Date().toISOString(),
            },
          },
        });
      expect(patch2.status).toBe(200);
      expect(patch2.body.permit.version).toBe(3);

      // Audit log captured draft update diffs
      const auditRes = await requesterAgent.get(`/api/permits/${permitId}/audit`).expect(200);
      const updateActions = auditRes.body.timeline.filter((t: any) => t.action === 'update');
      expect(updateActions.length).toBeGreaterThanOrEqual(5);

      // 7. Submit completed draft -> 200 PENDING_APPROVAL
      const submitRes = await requesterAgent.post(`/api/permits/${permitId}/submit`).send({}).expect(200);
      expect(submitRes.body.permit.status).toBe(PermitStatus.PENDING_APPROVAL);
    });
  });
});
