import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { seedDatabase } from '../../db/seed.js';
import { getPool, closeDbConnection } from '../../db/client.js';
import { permitDetailResponseDtoSchema, auditTimelineResponseDtoSchema } from '@ptw/shared';

describe('Permits API Contract Verification (Bug 1)', () => {
  let pool: ReturnType<typeof getPool>;
  let adminAgent: ReturnType<typeof request.agent>;
  let requesterAgent: ReturnType<typeof request.agent>;
  let testPermitId: string;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = getPool();

    adminAgent = request.agent(app);
    await adminAgent
      .post('/api/auth/login')
      .send({ email: 'admin@cmms.local', password: 'PtwPass2026!' })
      .expect(200);

    requesterAgent = request.agent(app);
    await requesterAgent
      .post('/api/auth/login')
      .send({ email: 'requester@cmms.local', password: 'PtwPass2026!' })
      .expect(200);

    // Pick an existing permit from database
    const permitRes = await pool.query('SELECT id FROM permits ORDER BY created_at ASC LIMIT 1');
    expect(permitRes.rows.length).toBeGreaterThan(0);
    testPermitId = permitRes.rows[0].id;
  });

  afterAll(async () => {
    await closeDbConnection();
  });

  it('GET /api/permits/:id matches permitDetailResponseDtoSchema contract strictly', async () => {
    const res = await adminAgent
      .get(`/api/permits/${testPermitId}`)
      .expect(200);

    // Runtime Zod schema validation
    const parsed = permitDetailResponseDtoSchema.safeParse(res.body);
    if (!parsed.success) {
      console.error('Validation errors:', JSON.stringify(parsed.error.issues, null, 2));
    }
    expect(parsed.success).toBe(true);

    // Verify critical fields exist and are not undefined
    const body = res.body;
    expect(body.permit).toBeDefined();
    expect(body.permit.id).toBe(testPermitId);
    expect(body.permit.permitNo).toBeTruthy();
    expect(body.permit.type).toBeTruthy();
    expect(body.permit.status).toBeTruthy();
    expect(body.permit.requesterId).toBeTruthy();
    expect(body.permit.plantId).toBeTruthy();
    expect(body.permit.areaId).toBeTruthy();
    expect(body.permit.contractorTeam).toBeDefined();
    expect(body.permit.workDescription).toBeDefined();
    expect(body.permit.plannedStart).toBeDefined();
    expect(body.permit.plannedEnd).toBeDefined();
    expect(Array.isArray(body.permit.hazards)).toBe(true);
    expect(Array.isArray(body.permit.ppe)).toBe(true);
    expect(typeof body.permit.details).toBe('object');
    expect(typeof body.permit.version).toBe('number');
    expect(body.permit.createdAt).toBeDefined();
    expect(body.permit.updatedAt).toBeDefined();

    // Check denormalized joins
    expect(body.permit.plantName).toBeDefined();
    expect(body.permit.areaName).toBeDefined();
    expect(body.permit.requesterName).toBeDefined();

    // Check approvals array
    expect(Array.isArray(body.approvals)).toBe(true);
    for (const appr of body.approvals) {
      expect(appr.id).toBeDefined();
      expect(appr.permitId).toBe(testPermitId);
      expect(appr.requiredRole).toBeDefined();
      expect(appr.status).toBeDefined();
    }

    // Check workLogs array
    expect(Array.isArray(body.workLogs)).toBe(true);

    // Check allowedActions array
    expect(Array.isArray(body.allowedActions)).toBe(true);
  });

  it('GET /api/permits/:id/audit matches auditTimelineResponseDtoSchema contract strictly', async () => {
    const res = await adminAgent
      .get(`/api/permits/${testPermitId}/audit`)
      .expect(200);

    // Runtime Zod schema validation
    const parsed = auditTimelineResponseDtoSchema.safeParse(res.body);
    if (!parsed.success) {
      console.error('Audit validation errors:', JSON.stringify(parsed.error.issues, null, 2));
    }
    expect(parsed.success).toBe(true);

    expect(Array.isArray(res.body.timeline)).toBe(true);
    expect(res.body.timeline.length).toBeGreaterThan(0);

    for (const entry of res.body.timeline) {
      expect(entry.id).toBeDefined();
      expect(entry.permitId).toBe(testPermitId);
      expect(entry.actorName).toBeTruthy();
      expect(entry.actorEmail).toBeTruthy();
      expect(entry.actorRole).toBeTruthy();
      expect(entry.action).toBeTruthy();
      expect(entry.createdAt).toBeDefined();
    }
  });
});
