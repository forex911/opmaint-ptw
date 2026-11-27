import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { app } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { seedDatabase } from '../../db/seed.js';
import { getPool, closeDbConnection } from '../../db/client.js';
import { env } from '../../config/env.js';
import { adminRateLimiter } from '../../middleware/rate-limit.js';
import { errorHandler } from '../../middleware/error-handler.js';
import {
  guardCannotModifySelf,
  guardNotLastAdmin,
  guardReassignAreasBeforeRoleOrDeactivate,
  guardActiveAreaOwner,
  guardNoOpenPermits,
  guardNoActiveChildren,
} from './admin.guards.js';

describe('Admin Guards Unit Tests', () => {
  it('blocks self-demotion and self-deactivation with 409 CANNOT_MODIFY_SELF', () => {
    const demoteSelf = guardCannotModifySelf({
      actorId: 'u1',
      targetUser: { id: 'u1', role: 'ADMIN', isActive: true },
      nextRole: 'REQUESTER',
    });
    expect(demoteSelf.ok).toBe(false);
    expect(demoteSelf.code).toBe('CANNOT_MODIFY_SELF');

    const deactivateSelf = guardCannotModifySelf({
      actorId: 'u1',
      targetUser: { id: 'u1', role: 'ADMIN', isActive: true },
      nextIsActive: false,
    });
    expect(deactivateSelf.ok).toBe(false);
    expect(deactivateSelf.code).toBe('CANNOT_MODIFY_SELF');

    const renameSelf = guardCannotModifySelf({
      actorId: 'u1',
      targetUser: { id: 'u1', role: 'ADMIN', isActive: true },
      nextRole: 'ADMIN',
      nextIsActive: true,
    });
    expect(renameSelf.ok).toBe(true);
  });

  it('blocks demoting or deactivating the last active admin with LAST_ADMIN', () => {
    const res = guardNotLastAdmin({
      targetUser: { id: 'u1', role: 'ADMIN', isActive: true },
      activeAdminCount: 1,
      nextIsActive: false,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('LAST_ADMIN');

    const okWithTwo = guardNotLastAdmin({
      targetUser: { id: 'u1', role: 'ADMIN', isActive: true },
      activeAdminCount: 2,
      nextRole: 'REQUESTER',
    });
    expect(okWithTwo.ok).toBe(true);
  });

  it('blocks removing AREA_OWNER role or deactivating while owning areas', () => {
    const res = guardReassignAreasBeforeRoleOrDeactivate({
      targetUser: { id: 'ao1', role: 'AREA_OWNER', isActive: true },
      ownedAreas: [{ id: 'a1', code: 'AREA-1', name: 'Area 1', plantId: 'p1' }],
      nextRole: 'REQUESTER',
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('REASSIGN_AREAS_FIRST');
    expect((res.details as any).areas).toHaveLength(1);
  });

  it('enforces active AREA_OWNER and open-permit / active-child deactivation barriers', () => {
    expect(guardActiveAreaOwner({ id: 'u', role: 'REQUESTER', isActive: true }).ok).toBe(false);
    expect(guardActiveAreaOwner({ id: 'u', role: 'AREA_OWNER', isActive: false }).ok).toBe(false);
    expect(guardActiveAreaOwner({ id: 'u', role: 'AREA_OWNER', isActive: true }).ok).toBe(true);

    const openRes = guardNoOpenPermits('Area', [
      { id: 'pm1', permitNo: 'PTW-2026-9999', status: 'ACTIVE' },
    ]);
    expect(openRes.ok).toBe(false);
    expect(openRes.code).toBe('HAS_OPEN_PERMITS');
    expect((openRes.details as any).permitNos).toContain('PTW-2026-9999');

    const childRes = guardNoActiveChildren('Plant', 'areas', [
      { id: 'a1', code: 'AREA-1', name: 'Area 1' },
    ]);
    expect(childRes.ok).toBe(false);
    expect(childRes.code).toBe('HAS_ACTIVE_CHILDREN');
  });
});

describe('Admin API Endpoints, Authorization, Area Reassignment & Audit Trails', () => {
  let pool: ReturnType<typeof getPool>;
  let adminAgent: ReturnType<typeof request.agent>;
  let requesterAgent: ReturnType<typeof request.agent>;
  let areaOwnerAgent: ReturnType<typeof request.agent>;
  let areaOwner2Agent: ReturnType<typeof request.agent>;
  let safetyOfficerAgent: ReturnType<typeof request.agent>;

  let adminId: string;
  let requesterId: string;
  let areaOwner1Id: string;
  let areaOwner2Id: string;
  let safetyOfficerId: string;

  const createdUserIds: string[] = [];
  const createdPlantIds: string[] = [];
  const createdAreaIds: string[] = [];
  const createdEquipmentIds: string[] = [];

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = getPool();

    adminAgent = request.agent(app);
    const adminLogin = await adminAgent
      .post('/api/auth/login')
      .send({ email: 'admin@cmms.local', password: 'PtwPass2026!' })
      .expect(200);
    adminId = adminLogin.body.user.id;

    requesterAgent = request.agent(app);
    const reqLogin = await requesterAgent
      .post('/api/auth/login')
      .send({ email: 'requester@cmms.local', password: 'PtwPass2026!' })
      .expect(200);
    requesterId = reqLogin.body.user.id;

    areaOwnerAgent = request.agent(app);
    const ao1Login = await areaOwnerAgent
      .post('/api/auth/login')
      .send({ email: 'area.owner@cmms.local', password: 'PtwPass2026!' })
      .expect(200);
    areaOwner1Id = ao1Login.body.user.id;

    areaOwner2Agent = request.agent(app);
    const ao2Login = await areaOwner2Agent
      .post('/api/auth/login')
      .send({ email: 'area.owner2@cmms.local', password: 'PtwPass2026!' })
      .expect(200);
    areaOwner2Id = ao2Login.body.user.id;

    safetyOfficerAgent = request.agent(app);
    const soLogin = await safetyOfficerAgent
      .post('/api/auth/login')
      .send({ email: 'safety.officer@cmms.local', password: 'PtwPass2026!' })
      .expect(200);
    safetyOfficerId = soLogin.body.user.id;
  });

  afterAll(async () => {
    // Delete scratch entities (must not hold FK rows in permits/admin_audit_log) and restore seeded flags/owners
    for (const eqId of createdEquipmentIds) {
      await pool.query('DELETE FROM equipment WHERE id = $1', [eqId]);
    }
    for (const areaId of createdAreaIds) {
      await pool.query('DELETE FROM areas WHERE id = $1', [areaId]);
    }
    for (const plantId of createdPlantIds) {
      await pool.query('DELETE FROM plants WHERE id = $1', [plantId]);
    }
    for (const userId of createdUserIds) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await seedDatabase(pool);
    await closeDbConnection();
  });

  it('rejects unauthenticated requests with 401 and non-ADMIN roles with 403 FORBIDDEN on all admin routes', async () => {
    const routes: Array<{ method: 'get' | 'post' | 'patch'; path: string; body?: object }> = [
      { method: 'get', path: '/api/admin/users' },
      { method: 'post', path: '/api/admin/users', body: {} },
      { method: 'patch', path: `/api/admin/users/${requesterId}`, body: { name: 'X' } },
      { method: 'post', path: `/api/admin/users/${requesterId}/reset-password`, body: { password: 'NewPassword1234' } },
      { method: 'get', path: '/api/admin/plants' },
      { method: 'post', path: '/api/admin/plants', body: {} },
      { method: 'get', path: '/api/admin/areas' },
      { method: 'post', path: '/api/admin/areas', body: {} },
      { method: 'get', path: '/api/admin/equipment' },
      { method: 'post', path: '/api/admin/equipment', body: {} },
      { method: 'get', path: '/api/admin/activity' },
    ];

    for (const r of routes) {
      const unauth = await (request(app) as any)[r.method](r.path).send(r.body);
      expect(unauth.status).toBe(401);

      for (const nonAdmin of [requesterAgent, areaOwnerAgent, safetyOfficerAgent]) {
        const forbidden = await (nonAdmin as any)[r.method](r.path).send(r.body);
        expect(forbidden.status).toBe(403);
        expect(forbidden.body.error.code).toBe('FORBIDDEN');
      }
    }
  });

  it('creates users per role, rejects duplicate email (409 EMAIL_TAKEN) and short password (422), and allows AREA_OWNER without areas', async () => {
    // 1. Short password -> 422
    const shortRes = await adminAgent.post('/api/admin/users').send({
      name: 'Short Pass',
      email: 'shortpass@cmms.local',
      password: 'short',
      role: 'REQUESTER',
    });
    expect(shortRes.status).toBe(422);

    // 2. Duplicate email -> 409 EMAIL_TAKEN
    const dupRes = await adminAgent.post('/api/admin/users').send({
      name: 'Dup User',
      email: 'REQUESTER@CMMS.LOCAL',
      password: 'ValidPassword2026!',
      role: 'REQUESTER',
    });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe('EMAIL_TAKEN');

    // 3. Create AREA_OWNER without any areaIds (explicitly allowed per spec approval #5)
    const aoRes = await adminAgent
      .post('/api/admin/users')
      .send({
        name: 'Temp Area Owner',
        email: `temp.ao.${Date.now()}@cmms.local`,
        password: 'ValidPassword2026!',
        role: 'AREA_OWNER',
      })
      .expect(201);
    createdUserIds.push(aoRes.body.user.id);
    expect(aoRes.body.user.role).toBe('AREA_OWNER');
    expect(aoRes.body.user.isActive).toBe(true);
    expect(aoRes.body.user.passwordHash).toBeUndefined();

    // 4. Create SAFETY_OFFICER and verify login works with initial password
    const soEmail = `temp.so.${Date.now()}@cmms.local`;
    const soRes = await adminAgent
      .post('/api/admin/users')
      .send({
        name: 'Temp Safety',
        email: soEmail,
        password: 'InitialSafetyPass2026!',
        role: 'SAFETY_OFFICER',
      })
      .expect(201);
    createdUserIds.push(soRes.body.user.id);

    const soAgent = request.agent(app);
    await soAgent
      .post('/api/auth/login')
      .send({ email: soEmail, password: 'InitialSafetyPass2026!' })
      .expect(200);

    // 5. Reject assigning areaIds to REQUESTER -> 422
    const areaRes = await pool.query('SELECT id FROM areas LIMIT 1');
    const badAssign = await adminAgent.post('/api/admin/users').send({
      name: 'Req With Area',
      email: `bad.assign.${Date.now()}@cmms.local`,
      password: 'ValidPassword2026!',
      role: 'REQUESTER',
      areaIds: [areaRes.rows[0].id],
    });
    expect(badAssign.status).toBe(422);
  });

  it('blocks self-demote/deactivate (CANNOT_MODIFY_SELF) and last-admin demote/deactivate (LAST_ADMIN)', async () => {
    // 1. Self-demote -> 409 CANNOT_MODIFY_SELF
    const selfDemote = await adminAgent
      .patch(`/api/admin/users/${adminId}`)
      .send({ role: 'REQUESTER' });
    expect(selfDemote.status).toBe(409);
    expect(selfDemote.body.error.code).toBe('CANNOT_MODIFY_SELF');

    // 2. Self-deactivate -> 409 CANNOT_MODIFY_SELF
    const selfDeactivate = await adminAgent
      .patch(`/api/admin/users/${adminId}`)
      .send({ isActive: false });
    expect(selfDeactivate.status).toBe(409);
    expect(selfDeactivate.body.error.code).toBe('CANNOT_MODIFY_SELF');

    // 3. Create a second admin; verify login/read works without writing actor_id audit rows,
    // then verify demoting/deactivating secondAdmin succeeds while 2 active admins exist, leaving 1 active admin
    const tempAdminEmail = `temp.admin.${Date.now()}@cmms.local`;
    const secondAdminRes = await adminAgent
      .post('/api/admin/users')
      .send({
        name: 'Second Admin',
        email: tempAdminEmail,
        password: 'AdminPassword2026!',
        role: 'ADMIN',
      })
      .expect(201);
    const secondAdminId = secondAdminRes.body.user.id;
    createdUserIds.push(secondAdminId);

    const secondAdminAgent = request.agent(app);
    await secondAdminAgent
      .post('/api/auth/login')
      .send({ email: tempAdminEmail, password: 'AdminPassword2026!' })
      .expect(200);
    await secondAdminAgent.get('/api/admin/users').expect(200);

    // Demote secondAdmin to REQUESTER -> 200 OK (adminId remains active ADMIN)
    await adminAgent
      .patch(`/api/admin/users/${secondAdminId}`)
      .send({ role: 'REQUESTER' })
      .expect(200);

    // Re-promote then deactivate secondAdmin -> 200 OK, leaving adminId as the sole active ADMIN
    await adminAgent
      .patch(`/api/admin/users/${secondAdminId}`)
      .send({ role: 'ADMIN' })
      .expect(200);
    await adminAgent
      .patch(`/api/admin/users/${secondAdminId}`)
      .send({ isActive: false })
      .expect(200);

    const activeAdmins = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'ADMIN' AND is_active = true`
    );
    expect(activeAdmins.rows[0].cnt).toBe(1);

    // Verify service-level guard rejects targeting the sole remaining active ADMIN with 409 LAST_ADMIN
    const { adminService } = await import('./admin.service.js');
    await expect(
      adminService.updateUser(adminId, { isActive: false }, secondAdminId)
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'LAST_ADMIN',
    });
    await expect(
      adminService.updateUser(adminId, { role: 'REQUESTER' }, secondAdminId)
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'LAST_ADMIN',
    });
  });

  it('blocks removing AREA_OWNER role or deactivating while owning areas (REASSIGN_AREAS_FIRST), and resets password without logging hashes', async () => {
    // 1. areaOwner1Id owns areas -> trying to demote or deactivate returns 409 REASSIGN_AREAS_FIRST
    const demoteRes = await adminAgent
      .patch(`/api/admin/users/${areaOwner1Id}`)
      .send({ role: 'REQUESTER' });
    expect(demoteRes.status).toBe(409);
    expect(demoteRes.body.error.code).toBe('REASSIGN_AREAS_FIRST');
    expect(Array.isArray(demoteRes.body.error.details.areas)).toBe(true);
    expect(demoteRes.body.error.details.areas.length).toBeGreaterThan(0);

    const deactivateRes = await adminAgent
      .patch(`/api/admin/users/${areaOwner1Id}`)
      .send({ isActive: false });
    expect(deactivateRes.status).toBe(409);
    expect(deactivateRes.body.error.code).toBe('REASSIGN_AREAS_FIRST');

    // 2. Create user -> deactivate -> verify login blocked -> reactivate -> reset password -> verify login & no leaked hash
    const targetEmail = `target.user.${Date.now()}@cmms.local`;
    const uRes = await adminAgent
      .post('/api/admin/users')
      .send({
        name: 'Target User',
        email: targetEmail,
        password: 'InitialPassword2026!',
        role: 'REQUESTER',
      })
      .expect(201);
    const targetId = uRes.body.user.id;
    createdUserIds.push(targetId);

    const targetAgent = request.agent(app);
    await targetAgent
      .post('/api/auth/login')
      .send({ email: targetEmail, password: 'InitialPassword2026!' })
      .expect(200);

    // Deactivate user via Admin API
    const deactRes = await adminAgent
      .patch(`/api/admin/users/${targetId}`)
      .send({ isActive: false })
      .expect(200);
    expect(deactRes.body.user.isActive).toBe(false);

    // Existing session immediately rejected with 401
    await targetAgent.get('/api/auth/me').expect(401);
    await targetAgent.get('/api/permits').expect(401);

    // New login fails with 401
    await request(app)
      .post('/api/auth/login')
      .send({ email: targetEmail, password: 'InitialPassword2026!' })
      .expect(401);

    // Reactivate and reset password
    await adminAgent
      .patch(`/api/admin/users/${targetId}`)
      .send({ isActive: true })
      .expect(200);

    const newSecret = 'ResetSuperSecretPassword2026!';
    await adminAgent
      .post(`/api/admin/users/${targetId}/reset-password`)
      .send({ password: newSecret })
      .expect(200);

    // Old password rejected, new password succeeds
    await request(app)
      .post('/api/auth/login')
      .send({ email: targetEmail, password: 'InitialPassword2026!' })
      .expect(401);

    await request(app)
      .post('/api/auth/login')
      .send({ email: targetEmail, password: newSecret })
      .expect(200);

    // Check admin_audit_log has RESET_PASSWORD and contains ZERO plaintext password or bcrypt hash
    const logsRes = await pool.query(
      `SELECT * FROM admin_audit_log WHERE entity_id = $1 ORDER BY id DESC`,
      [targetId]
    );
    const dump = JSON.stringify(logsRes.rows);
    expect(dump).not.toContain('InitialPassword2026!');
    expect(dump).not.toContain(newSecret);
    expect(dump).not.toContain('$2a$');
    expect(dump).not.toContain('$2b$');
    expect(logsRes.rows.some((r) => r.action === 'RESET_PASSWORD')).toBe(true);
  });

  it('reassigns PENDING AREA_OWNER approvals on area owner change, leaves decided rows and terminal permits untouched, and blocks HAS_OPEN_PERMITS (D-028)', async () => {
    // Use a seeded area owned by areaOwner1 that has no open permits (keeps plants/areas/equipment counts exact)
    const candidateRes = await pool.query(
      `SELECT a.id AS area_id, a.code AS area_code, a.name AS area_name,
              p.id AS plant_id, p.name AS plant_name,
              e.id AS equipment_id, e.name AS equipment_name
       FROM areas a
       JOIN plants p ON p.id = a.plant_id
       JOIN equipment e ON e.area_id = a.id
       WHERE a.owner_id = $1
         AND a.is_active = true
         AND e.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM permits pm
           WHERE pm.area_id = a.id
             AND pm.status NOT IN ('CLOSED_VERIFIED', 'CANCELLED', 'REJECTED', 'EXPIRED')
         )
       ORDER BY a.code ASC, e.tag ASC
       LIMIT 1`,
      [areaOwner1Id]
    );
    expect(candidateRes.rows.length).toBe(1);
    const {
      area_id: areaId,
      plant_id: plantId,
      plant_name: plantName,
      area_name: areaName,
      equipment_id: equipmentId,
      equipment_name: equipmentName,
    } = candidateRes.rows[0];

    let openPermitId = '';
    try {
      // 1. Create open permit & submit -> PENDING_APPROVAL (AREA_OWNER=areaOwner1 PENDING, SAFETY_OFFICER PENDING)
      const draftRes = await requesterAgent
        .post('/api/permits')
        .send({
          type: 'WORKING_AT_HEIGHT',
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Height Team',
          workDescription: 'Reassignment approval test permit',
          plannedStart: new Date(Date.now() + 3600000).toISOString(),
          plannedEnd: new Date(Date.now() + 10800000).toISOString(),
          details: {
            height_m: 6,
            access_method: 'scaffold',
            fall_arrest_equipment: 'Full Harness',
            anchor_point_checked: true,
            barricading_below: true,
          },
        })
        .expect(201);
      openPermitId = draftRes.body.permit.id;
      await requesterAgent.post(`/api/permits/${openPermitId}/submit`).expect(200);

      // Safety Officer decides their tier FIRST so we prove decided approvals remain untouched
      await safetyOfficerAgent
        .post(`/api/permits/${openPermitId}/approve`)
        .send({ comment: 'Safety cleared' })
        .expect(200);

      // 2. Also create a REJECTED (terminal) permit on the same area to prove terminal permits are untouched
      const rejDraft = await requesterAgent
        .post('/api/permits')
        .send({
          type: 'WORKING_AT_HEIGHT',
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Height Team',
          workDescription: 'Terminal permit untouched check',
          plannedStart: new Date(Date.now() + 3600000).toISOString(),
          plannedEnd: new Date(Date.now() + 10800000).toISOString(),
          details: {
            height_m: 6,
            access_method: 'scaffold',
            fall_arrest_equipment: 'Full Harness',
            anchor_point_checked: true,
            barricading_below: true,
          },
        })
        .expect(201);
      const terminalPermitId = rejDraft.body.permit.id;
      await requesterAgent.post(`/api/permits/${terminalPermitId}/submit`).expect(200);
      await areaOwnerAgent
        .post(`/api/permits/${terminalPermitId}/reject`)
        .send({ comment: 'Rejecting to make terminal' })
        .expect(200);

      // 3. Reassign area owner from areaOwner1 -> areaOwner2
      const patchRes = await adminAgent
        .patch(`/api/admin/areas/${areaId}`)
        .send({ ownerId: areaOwner2Id })
        .expect(200);
      expect(patchRes.body.area.ownerId).toBe(areaOwner2Id);

      // Verify open permit's PENDING AREA_OWNER approval switched to areaOwner2, SAFETY_OFFICER stayed decided by safetyOfficerId
      const openApprRes = await pool.query(
        'SELECT * FROM permit_approvals WHERE permit_id = $1 ORDER BY required_role ASC',
        [openPermitId]
      );
      const aoRow = openApprRes.rows.find((r) => r.required_role === 'AREA_OWNER');
      const soRow = openApprRes.rows.find((r) => r.required_role === 'SAFETY_OFFICER');
      expect(aoRow.required_user_id).toBe(areaOwner2Id);
      expect(aoRow.status).toBe('PENDING');
      expect(soRow.status).toBe('APPROVED');
      expect(soRow.decided_by).toBe(safetyOfficerId);

      // Verify audit_log wrote 'approver_reassigned' attributed to adminId on openPermitId, NOT terminalPermitId
      const openAuditRes = await pool.query(
        `SELECT * FROM audit_log WHERE permit_id = $1 AND action = 'approver_reassigned'`,
        [openPermitId]
      );
      expect(openAuditRes.rows.length).toBe(1);
      expect(openAuditRes.rows[0].actor_id).toBe(adminId);

      const termAuditRes = await pool.query(
        `SELECT * FROM audit_log WHERE permit_id = $1 AND action = 'approver_reassigned'`,
        [terminalPermitId]
      );
      expect(termAuditRes.rows.length).toBe(0);

      // Old owner (areaOwner1) blocked with 403 WRONG_AREA; new owner (areaOwner2) approves -> APPROVED!
      const oldApprove = await areaOwnerAgent
        .post(`/api/permits/${openPermitId}/approve`)
        .send({ comment: 'Old owner trying late' });
      expect(oldApprove.status).toBe(403);
      expect(oldApprove.body.error.code).toBe('WRONG_AREA');

      await areaOwner2Agent
        .post(`/api/permits/${openPermitId}/approve`)
        .send({ comment: 'New owner approving' })
        .expect(200);

      const afterApprove = await pool.query('SELECT status FROM permits WHERE id = $1', [openPermitId]);
      expect(afterApprove.rows[0].status).toBe('APPROVED');

      // Test deactivating equipment & area while open permit is APPROVED -> 409 HAS_OPEN_PERMITS!
      const deactEqOpen = await adminAgent
        .patch(`/api/admin/equipment/${equipmentId}`)
        .send({ isActive: false });
      expect(deactEqOpen.status).toBe(409);
      expect(deactEqOpen.body.error.code).toBe('HAS_OPEN_PERMITS');

      const deactAreaOpen = await adminAgent
        .patch(`/api/admin/areas/${areaId}`)
        .send({ isActive: false });
      expect(deactAreaOpen.status).toBe(409);
      expect(deactAreaOpen.body.error.code).toBe('HAS_OPEN_PERMITS');

      // Cancel open permit so both permits on equipmentId/areaId are terminal
      await requesterAgent
        .post(`/api/permits/${openPermitId}/cancel`)
        .send({ comment: 'Closing out test' })
        .expect(200);

      // Temporarily deactivate seeded equipmentId (now zero open permits) and verify old permit still renders its names
      await adminAgent
        .patch(`/api/admin/equipment/${equipmentId}`)
        .send({ isActive: false })
        .expect(200);
      const oldPermitView = await requesterAgent.get(`/api/permits/${openPermitId}`).expect(200);
      expect(oldPermitView.body.permit.plantName).toBe(plantName);
      expect(oldPermitView.body.permit.areaName).toBe(areaName);
      expect(oldPermitView.body.permit.equipmentName).toBe(equipmentName);
    } finally {
      // Restore seeded equipment active flag and area owner
      await adminAgent.patch(`/api/admin/equipment/${equipmentId}`).send({ isActive: true });
      await adminAgent.patch(`/api/admin/areas/${areaId}`).send({ ownerId: areaOwner1Id });
    }
  });

  it('enforces HAS_ACTIVE_CHILDREN, inactive location filtering, ?includeInactive=true RBAC, 422 on inactive create, and GET /api/admin/activity', async () => {
    // Scratch hierarchy with zero permits so afterAll deletes it cleanly without FK blocks
    const plantRes = await adminAgent
      .post('/api/admin/plants')
      .send({
        code: `PLT-ACT-${Date.now()}`,
        name: 'Lifecycle Test Plant',
        address: '10 Test Blvd',
      })
      .expect(201);
    const plantId = plantRes.body.plant.id;
    createdPlantIds.push(plantId);

    const areaRes = await adminAgent
      .post('/api/admin/areas')
      .send({
        code: `AREA-ACT-${Date.now()}`,
        name: 'Lifecycle Test Area',
        plantId,
        ownerId: areaOwner1Id,
      })
      .expect(201);
    const areaId = areaRes.body.area.id;
    createdAreaIds.push(areaId);

    const eqRes = await adminAgent
      .post('/api/admin/equipment')
      .send({
        tag: `EQ-ACT-${Date.now()}`,
        name: 'Lifecycle Test Pump',
        areaId,
      })
      .expect(201);
    const equipmentId = eqRes.body.equipment.id;
    createdEquipmentIds.push(equipmentId);

    // Deactivating plant with active area -> 409 HAS_ACTIVE_CHILDREN
    const deactPlantChild = await adminAgent
      .patch(`/api/admin/plants/${plantId}`)
      .send({ isActive: false });
    expect(deactPlantChild.status).toBe(409);
    expect(deactPlantChild.body.error.code).toBe('HAS_ACTIVE_CHILDREN');

    // Deactivating area with active equipment -> 409 HAS_ACTIVE_CHILDREN
    const deactAreaChild = await adminAgent
      .patch(`/api/admin/areas/${areaId}`)
      .send({ isActive: false });
    expect(deactAreaChild.status).toBe(409);
    expect(deactAreaChild.body.error.code).toBe('HAS_ACTIVE_CHILDREN');

    // Deactivate equipment -> 200 OK, then area -> 200 OK, then plant -> 200 OK
    const deactEqOk = await adminAgent
      .patch(`/api/admin/equipment/${equipmentId}`)
      .send({ isActive: false })
      .expect(200);
    expect(deactEqOk.body.equipment.isActive).toBe(false);

    const deactAreaOk = await adminAgent
      .patch(`/api/admin/areas/${areaId}`)
      .send({ isActive: false })
      .expect(200);
    expect(deactAreaOk.body.area.isActive).toBe(false);

    const deactPlantOk = await adminAgent
      .patch(`/api/admin/plants/${plantId}`)
      .send({ isActive: false })
      .expect(200);
    expect(deactPlantOk.body.plant.isActive).toBe(false);

    // Inactive locations hidden from public reads, shown to ADMIN with ?includeInactive=true, 403 for non-admin
    const pubAreas = await requesterAgent.get(`/api/areas?plantId=${plantId}`).expect(200);
    expect(pubAreas.body.areas.length).toBe(0);

    const nonAdminInclude = await requesterAgent.get('/api/areas?includeInactive=true');
    expect(nonAdminInclude.status).toBe(403);

    const adminInclude = await adminAgent.get('/api/areas?includeInactive=true').expect(200);
    expect(adminInclude.body.areas.some((a: any) => a.id === areaId && a.isActive === false)).toBe(true);

    // Creating a new permit with inactive location rejected 422 before creating a DB row
    const createInactive = await requesterAgent.post('/api/permits').send({
      type: 'HOT_WORK',
      plantId,
      areaId,
      equipmentId,
      contractorTeam: 'Team',
      workDescription: 'Should fail on inactive plant',
      plannedStart: new Date(Date.now() + 3600000).toISOString(),
      plannedEnd: new Date(Date.now() + 7200000).toISOString(),
    });
    expect(createInactive.status).toBe(422);

    // Verify GET /api/admin/activity returns paginated audit log entries
    const actRes = await adminAgent.get('/api/admin/activity?page=1&limit=10').expect(200);
    expect(actRes.body.items.length).toBeGreaterThan(0);
    expect(actRes.body.pagination.total).toBeGreaterThan(0);
  });

  it('rejects duplicate plant code, duplicate area code in same plant, duplicate equipment tag, and non-AREA_OWNER area assignment', async () => {
    const dupPlant = await adminAgent.post('/api/admin/plants').send({
      code: 'PLANT-CHE-01',
      name: 'Duplicate Code',
    });
    expect(dupPlant.status).toBe(409);
    expect(dupPlant.body.error.code).toBe('CODE_TAKEN');

    const chePlant = await pool.query("SELECT id FROM plants WHERE code = 'PLANT-CHE-01'");
    const dupArea = await adminAgent.post('/api/admin/areas').send({
      code: 'AREA-MPC-01',
      name: 'Duplicate Area',
      plantId: chePlant.rows[0].id,
      ownerId: areaOwner1Id,
    });
    expect(dupArea.status).toBe(409);
    expect(dupArea.body.error.code).toBe('CODE_TAKEN');

    const badOwner = await adminAgent.post('/api/admin/areas').send({
      code: 'AREA-NEW-BAD-OWNER',
      name: 'Invalid Owner',
      plantId: chePlant.rows[0].id,
      ownerId: requesterId,
    });
    expect(badOwner.status).toBe(422);

    const anyArea = await pool.query('SELECT id FROM areas LIMIT 1');
    const dupEq = await adminAgent.post('/api/admin/equipment').send({
      tag: 'P-101A',
      name: 'Duplicate Eq',
      areaId: anyArea.rows[0].id,
    });
    expect(dupEq.status).toBe(409);
    expect(dupEq.body.error.code).toBe('CODE_TAKEN');
  });

  it('enforces adminRateLimiter rate limit with 429 RATE_LIMIT_EXCEEDED', async () => {
    const miniApp = express();
    miniApp.use(cookieParser());
    miniApp.use((req, _res, next) => {
      req.user = { id: adminId, name: 'Admin', email: 'admin@cmms.local', role: 'ADMIN', isActive: true };
      next();
    });
    miniApp.post('/limited', adminRateLimiter({ maxRequests: 2, windowMs: 60000 }), (_req, res) => {
      res.status(200).json({ ok: true });
    });
    miniApp.use(errorHandler);

    await request(miniApp).post('/limited').expect(200);
    await request(miniApp).post('/limited').expect(200);
    const blocked = await request(miniApp).post('/limited').expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
