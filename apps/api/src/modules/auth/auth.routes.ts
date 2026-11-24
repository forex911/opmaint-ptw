import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { loginSchema } from './auth.schema.js';
import { requireAuth } from '../../middleware/auth.js';
import { loginRateLimiter } from '../../middleware/rate-limit.js';

export const authRouter = Router();

// Rate limiter for login: keyed by IP + email, max 10 failed attempts per 15 min, successes not counted
const loginLimiter = loginRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxFailures: 10,
  message: 'Too many failed login attempts for this account. Please try again later.',
});

// POST /api/auth/login
authRouter.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  (req, res, next) => authController.login(req, res, next)
);

// POST /api/auth/logout
authRouter.post('/logout', (req, res, next) => authController.logout(req, res, next));

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req, res, next) => authController.me(req, res, next));
