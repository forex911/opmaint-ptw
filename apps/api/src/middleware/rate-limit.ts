import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error.js';
import { env } from '../config/env.js';

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum attempts per window
  message?: string;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

/**
 * In-memory sliding rate limiter designed for critical endpoints like login.
 */
export function rateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message = 'Too many login attempts. Please try again later.' } = options;
  const effectiveMax = env.NODE_ENV === 'test' ? 1000 : max;
  const clients = new Map<string, ClientRecord>();

  // Cleanup expired entries periodically (every 5 minutes)
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of clients.entries()) {
      if (now > record.resetTime) {
        clients.delete(ip);
      }
    }
  }, 5 * 60 * 1000);

  // Prevent interval from keeping Node process alive in tests
  if (interval.unref) {
    interval.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown-client';
    const now = Date.now();

    const record = clients.get(clientIp);

    if (!record || now > record.resetTime) {
      clients.set(clientIp, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    record.count += 1;

    if (record.count > effectiveMax) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec.toString());
      return next(AppError.rateLimit(message));
    }

    next();
  };
}
