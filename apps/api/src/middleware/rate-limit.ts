import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error.js';

interface ClientRecord {
  count: number;
  resetTime: number;
}

interface LoginRateLimitOptions {
  windowMs?: number; // Time window in milliseconds (default: 15 min)
  maxFailures?: number; // Maximum failed attempts before blocking (default: 10)
  message?: string;
}

/**
 * Login rate limiter keyed by (IP + email).
 * Tracks strictly failed login attempts (HTTP 401).
 * Successful logins (HTTP 200) do NOT count and clear any accumulated failure count,
 * ensuring plant reviewers switching between demo accounts are never locked out.
 */
export function loginRateLimiter(options: LoginRateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const maxFailures = options.maxFailures ?? 10;
  const message =
    options.message ?? 'Too many failed login attempts for this account. Please try again later.';

  const failures = new Map<string, ClientRecord>();

  // Periodically clean up expired entries (every 5 minutes)
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of failures.entries()) {
      if (now > record.resetTime) {
        failures.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown-client';
    const email =
      typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : 'anonymous';
    const key = `${clientIp}:${email}`;
    const now = Date.now();

    const record = failures.get(key);

    // If failures have exceeded threshold and the window has not expired, block immediately
    if (record && now <= record.resetTime && record.count >= maxFailures) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec.toString());
      return next(AppError.rateLimit(message));
    }

    // Intercept response finish: only increment on failed authentication
    res.on('finish', () => {
      if (res.statusCode === 401) {
        const cur = failures.get(key);
        if (!cur || Date.now() > cur.resetTime) {
          failures.set(key, { count: 1, resetTime: Date.now() + windowMs });
        } else {
          cur.count += 1;
        }
      } else if (res.statusCode === 200) {
        // Successful login resets failures for this IP+email pair
        failures.delete(key);
      }
    });

    next();
  };
}

