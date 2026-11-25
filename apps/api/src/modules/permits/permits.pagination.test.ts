import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { seedDatabase } from '../../db/seed.js';
import { getPool, closeDbConnection } from '../../db/client.js';

describe('Bug 3 API Test: Permit Pagination', () => {
  let pool: ReturnType<typeof getPool>;
  let requesterAgent: ReturnType<typeof request.agent>;
  let totalSeeded: number;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = getPool();

    requesterAgent = request.agent(app);
    await requesterAgent
      .post('/api/auth/login')
      .send({ email: 'requester@cmms.local', password: 'PtwPass2026!' })
      .expect(200);

    const countRes = await pool.query('SELECT count(*)::integer AS total FROM permits');
    totalSeeded = countRes.rows[0].total;
  });

  afterAll(async () => {
    await closeDbConnection();
  });

  it('GET /api/permits?page=1&limit=5 and page=2&limit=5 paginate correctly', async () => {
    // 1. Fetch Page 1
    const res1 = await requesterAgent
      .get('/api/permits?page=1&limit=5')
      .expect(200);

    expect(res1.body.pagination).toBeDefined();
    expect(res1.body.pagination.page).toBe(1);
    expect(res1.body.pagination.limit).toBe(5);
    expect(res1.body.pagination.total).toBe(totalSeeded);
    expect(res1.body.pagination.totalPages).toBe(Math.ceil(totalSeeded / 5));
    expect(res1.body.items.length).toBe(Math.min(5, totalSeeded));

    const page1Ids = res1.body.items.map((p: any) => p.id);

    // 2. Fetch Page 2
    const res2 = await requesterAgent
      .get('/api/permits?page=2&limit=5')
      .expect(200);

    expect(res2.body.pagination).toBeDefined();
    expect(res2.body.pagination.page).toBe(2);
    expect(res2.body.pagination.limit).toBe(5);
    expect(res2.body.pagination.total).toBe(totalSeeded);
    expect(res2.body.pagination.totalPages).toBe(Math.ceil(totalSeeded / 5));

    const expectedPage2Count = Math.max(0, Math.min(5, totalSeeded - 5));
    expect(res2.body.items.length).toBe(expectedPage2Count);

    const page2Ids = res2.body.items.map((p: any) => p.id);

    // Verify page 2 items are different from page 1 items
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
  });
});
