import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { AUTH_COOKIE_OPTIONS } from '../../utils/jwt.js';
import { env } from '../../config/env.js';

export class AuthController {
  /**
   * POST /api/auth/login
   * Validates credentials, sets httpOnly cookie with JWT, returns user info.
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user, token } = await authService.login(req.body);

      // Set httpOnly session cookie
      res.cookie(env.COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);

      res.status(200).json({ user });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   * Clears httpOnly session cookie.
   */
  async logout(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.clearCookie(env.COOKIE_NAME, {
        ...AUTH_COOKIE_OPTIONS,
        maxAge: 0,
      });

      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/me
   * Returns current authenticated user identity (no password).
   */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ user: req.user });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
