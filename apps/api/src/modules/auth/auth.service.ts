import bcrypt from 'bcryptjs';
import { getPool } from '../../db/client.js';
import { signToken } from '../../utils/jwt.js';
import { AppError } from '../../errors/app-error.js';
import type { LoginInput } from './auth.schema.js';
import type { AuthUser } from '../../middleware/auth.js';

// Pre-computed dummy hash to ensure constant-time response for unknown emails (timing attack defense)
const DUMMY_HASH = bcrypt.hashSync('timing-defense-dummy-password', 10);

export interface LoginResult {
  user: AuthUser;
  token: string;
}

export class AuthService {
  /**
   * Authenticates user with email and password.
   * Returns identical 401 error message for unknown email and bad password.
   * Compares against dummy hash when user is not found to prevent timing enumeration.
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const pool = getPool();
    const normalizedEmail = input.email.toLowerCase().trim();

    const result = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE lower(email) = $1',
      [normalizedEmail]
    );

    const user = result.rows[0];

    if (!user) {
      // Execute constant-time bcrypt comparison against dummy hash to prevent timing attacks
      await bcrypt.compare(input.password, DUMMY_HASH);
      throw AppError.unauthorized('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(input.password, user.password_hash);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid email or password');
    }

    // JWT carries ONLY user ID
    const token = signToken({ userId: user.id });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    };
  }

  /**
   * Retrieves the current user profile by user ID.
   * Password hash is strictly excluded.
   */
  async getMe(userId: string): Promise<AuthUser> {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [userId]
    );

    const user = result.rows[0];
    if (!user) {
      throw AppError.unauthorized('User not found');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}

export const authService = new AuthService();
