import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { AppError } from '../errors/app-error.js';

interface LoginRateLimitOptions {
  windowMs?: number; // Time window in milliseconds (default: 15 min)
  maxFailures?: number; // Maximum failed attempts before blocking (default: 10)
  message?: string;
}

/**
 * Login rate limiter using express-rate-limit keyed by (IP + email).
 * Tracks strictly failed login attempts (skipSuccessfulRequests: true).
 * Successful logins (HTTP 200) do NOT count against the threshold.
 */
export function loginRateLimiter(options: LoginRateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const maxFailures = options.maxFailures ?? 10;
  const message =
    options.message ?? 'Too many failed login attempts for this account. Please try again later.';

  return rateLimit({
    windowMs,
    limit: maxFailures,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip || '127.0.0.1');
      const email =
        typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : 'anonymous';
      return `${ip}:${email}`;
    },
    handler: (_req, _res, next) => {
      return next(AppError.rateLimit(message));
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

interface AdminRateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
}

/**
 * Rate limiter protecting sensitive admin identity and password mutations.
 */
export function adminRateLimiter(options: AdminRateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const maxRequests =
    options.maxRequests ?? (process.env.NODE_ENV === 'test' ? 500 : 60);
  const message =
    options.message ?? 'Too many administrative user requests. Please try again later.';

  return rateLimit({
    windowMs,
    limit: maxRequests,
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip || '127.0.0.1');
      const actor = req.user?.id || 'anon';
      return `admin:${actor}:${ip}`;
    },
    handler: (_req, _res, next) => {
      return next(AppError.rateLimit(message));
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

