import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { seedDatabase, SEED_ACCOUNTS } from '../../db/seed.js';
import { getPool, closeDbConnection } from '../../db/client.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { UserRole } from '@ptw/shared';
import { env } from '../../config/env.js';

describe('Auth Module, Role Middleware, & Error Handling', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    // Run migrations and seed the real test database
    await runMigrations();
    await seedDatabase();

    // Mount test-only route to test requireRole without exposing it in production routes (Requirement 6)
    app = createApp((testApp) => {
      testApp.get('/api/test/admin-only', requireAuth, requireRole(UserRole.ADMIN), (req, res) => {
        res.status(200).json({ ok: true, user: req.user });
      });
    });
  });

  afterAll(async () => {
    await closeDbConnection();
  });

  describe('POST /api/auth/login', () => {
    it.each(SEED_ACCOUNTS)('authenticates role $role and sets httpOnly session cookie', async (account) => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: account.email,
          password: account.passwordPlain,
        });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(account.email);
      expect(res.body.user.role).toBe(account.role);
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.password_hash).toBeUndefined();

      // Verify Set-Cookie header contains httpOnly cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join(';') : (cookies as string);
      expect(cookieStr).toContain(`${env.COOKIE_NAME}=`);
      expect(cookieStr.toLowerCase()).toContain('httponly');
      expect(cookieStr.toLowerCase()).toContain('samesite=lax');
    });

    it('returns 401 when password is wrong', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'requester@cmms.local',
          password: 'WrongPassword2026!',
        });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        },
      });
    });

    it('returns identical 401 error body when email does not exist (timing attack defense)', async () => {
      const wrongPasswordRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'requester@cmms.local',
          password: 'WrongPassword2026!',
        });

      const unknownEmailRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent.user@cmms.local',
          password: 'AnyPassword2026!',
        });

      expect(unknownEmailRes.status).toBe(401);
      expect(unknownEmailRes.body).toEqual(wrongPasswordRes.body);
      expect(unknownEmailRes.body).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        },
      });
    });

    it('returns 422 VALIDATION_ERROR when login payload is malformed', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'not-an-email',
          password: '',
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Validation failed');
      expect(res.body.error.details).toBeDefined();
      expect(res.body.error.details.email).toBeDefined();
      expect(res.body.error.details.password).toBeDefined();
    });
  });

  describe('GET /api/auth/me & requireAuth Middleware', () => {
    it('returns 401 when no session cookie is sent', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    });

    it('returns 401 when token is forged or signed with an invalid key', async () => {
      const forgedToken = jwt.sign(
        { userId: '00000000-0000-0000-0000-000000000000' },
        'wrong-secret-key-that-does-not-match-env-secret-at-all!!'
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`${env.COOKIE_NAME}=${forgedToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Invalid or expired authentication token');
    });

    it('returns 401 when token is expired', async () => {
      const expiredToken = jwt.sign(
        { userId: '00000000-0000-0000-0000-000000000000' },
        env.JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`${env.COOKIE_NAME}=${expiredToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Invalid or expired authentication token');
    });

    it('returns authenticated user profile and strictly excludes password_hash', async () => {
      const agent = request.agent(app);

      // 1. Log in to establish session cookie
      await agent
        .post('/api/auth/login')
        .send({
          email: 'requester@cmms.local',
          password: 'PtwPass2026!',
        })
        .expect(200);

      // 2. Fetch /me using the authenticated session
      const meRes = await agent.get('/api/auth/me').expect(200);

      expect(meRes.body.user).toBeDefined();
      expect(meRes.body.user.email).toBe('requester@cmms.local');
      expect(meRes.body.user.role).toBe(UserRole.REQUESTER);
      expect(meRes.body.user.password).toBeUndefined();
      expect(meRes.body.user.password_hash).toBeUndefined();
    });
  });

  describe('Role-Based Access Control (requireRole Middleware)', () => {
    it('blocks unauthorized roles with 403 FORBIDDEN', async () => {
      const agent = request.agent(app);

      // Log in as REQUESTER
      await agent
        .post('/api/auth/login')
        .send({
          email: 'requester@cmms.local',
          password: 'PtwPass2026!',
        })
        .expect(200);

      // Attempt to access ADMIN-only test route
      const res = await agent.get('/api/test/admin-only');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: "Forbidden: role 'REQUESTER' is not authorized to access this resource",
        },
      });
    });

    it('allows authorized roles with 200 OK', async () => {
      const agent = request.agent(app);

      // Log in as ADMIN
      await agent
        .post('/api/auth/login')
        .send({
          email: 'admin@cmms.local',
          password: 'PtwPass2026!',
        })
        .expect(200);

      // Access ADMIN-only test route
      const res = await agent.get('/api/test/admin-only');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user.role).toBe(UserRole.ADMIN);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears session cookie on logout', async () => {
      const agent = request.agent(app);

      // Log in
      await agent
        .post('/api/auth/login')
        .send({
          email: 'requester@cmms.local',
          password: 'PtwPass2026!',
        })
        .expect(200);

      // Logout
      const logoutRes = await agent.post('/api/auth/logout').expect(200);
      expect(logoutRes.body).toEqual({ message: 'Logged out successfully' });

      // Verify subsequent request to /me is unauthorized
      const meRes = await agent.get('/api/auth/me');
      expect(meRes.status).toBe(401);
    });
  });

  describe('GET /health & 404 Route Not Found', () => {
    it('GET /health returns 200 with status ok and timestamp', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });

    it('returns 404 in standardized error envelope for non-existent routes', async () => {
      const res = await request(app).get('/api/non-existent-route');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Route GET /api/non-existent-route not found',
        },
      });
    });
  });
});
