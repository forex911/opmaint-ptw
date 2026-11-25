import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';

/**
 * Constant-time string comparison using sha256 hashing + crypto.timingSafeEqual.
 * Completely eliminates any timing leak including buffer length differences.
 */
export function timingSafeEqualSecret(provided: string, expected: string): boolean {
  const hashProvided = crypto.createHash('sha256').update(provided).digest();
  const hashExpected = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

/**
 * Middleware protecting internal administrative and cron endpoints.
 * Validates X-Sweep-Secret header against env.SWEEP_SECRET using constant-time comparison.
 * Never logs, echoes, or returns the secret.
 */
export function requireSweepSecret(req: Request, res: Response, next: NextFunction): void {
  const providedSecret = req.header('x-sweep-secret');

  if (!providedSecret || !timingSafeEqualSecret(providedSecret, env.SWEEP_SECRET)) {
    // Return identical sanitized 401 response for missing or incorrect secrets
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing sweep secret',
      },
    });
    return;
  }

  next();
}

/**
 * Rate limiter for internal sweep endpoints.
 * Protects against aggressive sweep triggers (max 30 requests per minute).
 */
export const sweepRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30, // max 30 requests per minute
  handler: (_req, _res, next) => {
    return next(AppError.rateLimit('Too many sweep requests. Please wait before triggering another sweep.'));
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' && !process.env.TEST_SWEEP_RATE_LIMIT,
});
