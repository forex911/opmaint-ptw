import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env.js';

/**
 * Constant-time string comparison using crypto.timingSafeEqual.
 * Prevents timing attacks against the sweep secret.
 */
export function timingSafeEqualSecret(provided: string, expected: string): boolean {
  const bufProvided = Buffer.from(provided, 'utf-8');
  const bufExpected = Buffer.from(expected, 'utf-8');

  if (bufProvided.length !== bufExpected.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufProvided, bufExpected);
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
