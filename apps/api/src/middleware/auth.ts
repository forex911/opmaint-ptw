import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/client.js';
import { verifyToken } from '../utils/jwt.js';
import { AppError } from '../errors/app-error.js';
import { env } from '../config/env.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

// Augment Express Request declaration
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Cookie-only authentication middleware.
 * Strictly checks req.cookies[COOKIE_NAME] (no Bearer fallback per D-016).
 * Reads the userId from the JWT and loads the current user from the database on every request.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[env.COOKIE_NAME];

    if (!token) {
      return next(AppError.unauthorized('Authentication required'));
    }

    let decoded: { userId: string };
    try {
      decoded = verifyToken(token);
    } catch {
      return next(AppError.unauthorized('Invalid or expired authentication token'));
    }

    if (!decoded?.userId) {
      return next(AppError.unauthorized('Invalid token payload'));
    }

    // Load active user from database to ensure fresh role and active status
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return next(AppError.unauthorized('User not found or inactive'));
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Role-based authorization middleware guard.
 * Returns HTTP 403 Forbidden if req.user.role is not in the allowed list.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Forbidden: role '${req.user.role}' is not authorized to access this resource`
        )
      );
    }

    next();
  };
}
