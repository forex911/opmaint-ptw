import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { seedDatabase } from '../../db/seed.js';
import { getPool, closeDbConnection } from '../../db/client.js';

describe('Bug 2 Reproduction: Equipment Cascade & Validation', () => {
  let pool: ReturnType<typeof getPool>;
  let requesterAgent: ReturnType<typeof request.agent>;
  let plant1Id: string;
  let area1Id: string;
  let area2Id: string;
  let equipment1Id: string;
  let equipment3Id: string;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = getPool();

    requesterAgent = request.agent(app);
    await requesterAgent
      .post('/api/auth/login')
      .send({ email: 'requester@cmms.local', password: 'PtwPass2026!' })
      .expect(200);

    const eqRes = await pool.query(`
      SELECT e.id as equipment_id, e.area_id, a.plant_id 
      FROM equipment e 
      JOIN areas a ON a.id = e.area_id
      ORDER BY e.tag ASC
    `);

    plant1Id = eqRes.rows[0].plant_id;
    area1Id = eqRes.rows[0].area_id;
    equipment1Id = eqRes.rows[0].equipment_id;

    // Pick an equipment from a different area
    const diffAreaEq = eqRes.rows.find((r) => r.area_id !== area1Id)!;
    area2Id = diffAreaEq.area_id;
    equipment3Id = diffAreaEq.equipment_id;
  });

  afterAll(async () => {
    await closeDbConnection();
  });

  it('GET /api/equipment?areaId=<id> returns only equipment in that area', async () => {
    const res = await requesterAgent
      .get(`/api/equipment?areaId=${area1Id}`)
      .expect(200);

    expect(Array.isArray(res.body.equipment)).toBe(true);
    expect(res.body.equipment.length).toBeGreaterThan(0);
    for (const eq of res.body.equipment) {
      expect(eq.areaId).toBe(area1Id);
    }
  });

  it('REPRODUCTION: Submitting empty string equipmentId fails with Invalid equipment ID format', async () => {
    const res = await requesterAgent
      .post('/api/permits')
      .send({
        type: 'HOT_WORK',
        plantId: plant1Id,
        areaId: area1Id,
        equipmentId: '', // Empty string sent by frontend form
        contractorTeam: 'Team Alpha',
        workDescription: 'Welding task without equipment',
        plannedStart: new Date(Date.now() + 3600000).toISOString(),
        plannedEnd: new Date(Date.now() + 7200000).toISOString(),
      });

    console.log('Empty string equipmentId response:', res.status, res.body);
    expect(res.status).toBe(422);
    expect(res.body.error.details.equipmentId).toContain('Invalid equipment ID format');
  });

  it('draft without equipment OK: creating draft without equipmentId succeeds with null equipmentId', async () => {
    const res = await requesterAgent
      .post('/api/permits')
      .send({
        type: 'HOT_WORK',
        plantId: plant1Id,
        areaId: area1Id,
        // equipmentId omitted
        contractorTeam: 'Team Alpha',
        workDescription: 'General area inspection without equipment',
        plannedStart: new Date(Date.now() + 3600000).toISOString(),
        plannedEnd: new Date(Date.now() + 7200000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.permit).toBeDefined();
    expect(res.body.permit.equipmentId).toBeNull();
    expect(res.body.permit.status).toBe('DRAFT');
  });

  it('equipment outside the area 422: submitting mismatched equipmentId returns 422 "Select equipment from the chosen area"', async () => {
    const res = await requesterAgent
      .post('/api/permits')
      .send({
        type: 'HOT_WORK',
        plantId: plant1Id,
        areaId: area1Id,
        equipmentId: equipment3Id, // equipment3 belongs to area2
        contractorTeam: 'Team Alpha',
        workDescription: 'Testing mismatched equipment',
        plannedStart: new Date(Date.now() + 3600000).toISOString(),
        plannedEnd: new Date(Date.now() + 7200000).toISOString(),
      });

    expect(res.status).toBe(422);
    expect(res.body.error.details.equipmentId).toContain('Select equipment from the chosen area');
  });

  it('submit without equipment 422: submitting draft without equipmentId returns 422 "Select equipment from the chosen area"', async () => {
    // 1. Create draft without equipment
    const draftRes = await requesterAgent
      .post('/api/permits')
      .send({
        type: 'HOT_WORK',
        plantId: plant1Id,
        areaId: area1Id,
        contractorTeam: 'Team Alpha',
        workDescription: 'Draft without equipment for submit test',
        plannedStart: new Date(Date.now() + 3600000).toISOString(),
        plannedEnd: new Date(Date.now() + 7200000).toISOString(),
        details: {
          hot_work_type: 'welding',
          fire_watch_assigned: true,
          extinguisher_type: 'CO2 5kg',
          combustibles_cleared_radius_m: 15,
          gas_test: {
            lel_pct: 0,
            o2_pct: 20.9,
            tested_at: new Date().toISOString(),
          },
        },
      })
      .expect(201);

    const permitId = draftRes.body.permit.id;
    expect(draftRes.body.permit.equipmentId).toBeNull();

    // 2. Attempt to submit without equipment -> 422
    const submitRes = await requesterAgent
      .post(`/api/permits/${permitId}/submit`)
      .expect(422);

    expect(submitRes.body.error.code).toBe('VALIDATION_ERROR');
    expect(submitRes.body.error.message).toContain('Select equipment from the chosen area');
  });

  it('submit with valid equipment succeeds and transitions to PENDING_APPROVAL', async () => {
    // 1. Create draft without equipment
    const draftRes = await requesterAgent
      .post('/api/permits')
      .send({
        type: 'HOT_WORK',
        plantId: plant1Id,
        areaId: area1Id,
        contractorTeam: 'Team Alpha',
        workDescription: 'Draft to be updated with equipment',
        plannedStart: new Date(Date.now() + 3600000).toISOString(),
        plannedEnd: new Date(Date.now() + 7200000).toISOString(),
        details: {
          hot_work_type: 'welding',
          fire_watch_assigned: true,
          extinguisher_type: 'CO2 5kg',
          combustibles_cleared_radius_m: 15,
          gas_test: {
            lel_pct: 0,
            o2_pct: 20.9,
            tested_at: new Date().toISOString(),
          },
        },
      })
      .expect(201);

    const permitId = draftRes.body.permit.id;

    // 2. Attach valid equipment from area1
    await requesterAgent
      .patch(`/api/permits/${permitId}`)
      .send({
        version: draftRes.body.permit.version,
        equipmentId: equipment1Id,
      })
      .expect(200);

    // 3. Submit succeeds
    const submitRes = await requesterAgent
      .post(`/api/permits/${permitId}/submit`)
      .expect(200);

    expect(submitRes.body.permit.status).toBe('PENDING_APPROVAL');
    expect(submitRes.body.permit.equipmentId).toBe(equipment1Id);
  });
});
