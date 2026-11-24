import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface TokenPayload {
  userId: string;
}

/**
 * Signs a stateless JWT carrying ONLY the user ID.
 */
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verifies a JWT and extracts the user ID.
 * Throws an error if invalid, forged, or expired.
 */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

/**
 * Production-ready, secure cookie configuration.
 * Adheres to D-016 (SameSite=Lax for same-origin reverse-proxy deployment).
 */
export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 8 * 60 * 60 * 1000, // 8 hours (matches JWT_EXPIRES_IN default)
  path: '/',
};
