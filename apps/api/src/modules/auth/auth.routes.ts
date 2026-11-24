import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { loginSchema } from './auth.schema.js';
import { requireAuth } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rate-limit.js';

export const authRouter = Router();

// Rate limiter for login: max 5 requests per 15 minutes per IP
const loginLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again later.',
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
