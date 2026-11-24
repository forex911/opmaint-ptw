import { describe, it, expect } from 'vitest';
import { env, parseEnv, KNOWN_DEV_SWEEP_SECRET } from './env.js';

describe('API Environment Configuration', () => {
  it('loads valid environment defaults', () => {
    expect(env.PORT).toBeDefined();
    expect(typeof env.PORT).toBe('number');
    expect(env.NODE_ENV).toBeDefined();
    expect(['development', 'production', 'test']).toContain(env.NODE_ENV);
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.SWEEP_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.SWEEP_CRON_SCHEDULE).toBe('* * * * *');
  });

  // 1. Missing production secret
  it('fails validation if SWEEP_SECRET is missing in production', () => {
    expect(() => {
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        DATABASE_URL: 'postgres://localhost:5432/ptw_cmms',
        // SWEEP_SECRET omitted
      });
    }).toThrow(/SWEEP_SECRET is required in production/);
  });

  // 1b. Known dev placeholder rejected in production
  it('fails validation if SWEEP_SECRET uses the known dev fallback or template placeholder in production', () => {
    expect(() => {
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        DATABASE_URL: 'postgres://localhost:5432/ptw_cmms',
        SWEEP_SECRET: KNOWN_DEV_SWEEP_SECRET,
      });
    }).toThrow(/SWEEP_SECRET in production must not use the known development fallback/);

    expect(() => {
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        DATABASE_URL: 'postgres://localhost:5432/ptw_cmms',
        SWEEP_SECRET: 'YOUR_PRODUCTION_SWEEP_SECRET_MIN_32_CHARS_LONG',
      });
    }).toThrow(/SWEEP_SECRET in production must not use the known development fallback/);
  });

  // 2. Secret shorter than 32 characters
  it('fails validation if SWEEP_SECRET is shorter than 32 characters in production', () => {
    expect(() => {
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        DATABASE_URL: 'postgres://localhost:5432/ptw_cmms',
        SWEEP_SECRET: 'too-short-secret',
      });
    }).toThrow(/SWEEP_SECRET must be at least 32 characters long/);
  });

  it('fails validation if SWEEP_SECRET is shorter than 32 characters in development', () => {
    expect(() => {
      parseEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'a'.repeat(32),
        DATABASE_URL: 'postgres://localhost:5432/ptw_cmms',
        SWEEP_SECRET: 'short-dev-secret',
      });
    }).toThrow(/SWEEP_SECRET must be at least 32 characters long/);
  });

  // 3. Valid production secret
  it('successfully parses valid production environment with explicit 32+ char secret', () => {
    const validProdSecret = 'c7a4b89f0123456789abcdef0123456789abcdef0123456789abcdef01234567';
    const parsed = parseEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'super-secure-production-jwt-secret-key-32-chars!',
      DATABASE_URL: 'postgres://ptw_user:pass@prod-db.internal:5432/ptw_cmms',
      SWEEP_SECRET: validProdSecret,
    });

    expect(parsed.NODE_ENV).toBe('production');
    expect(parsed.SWEEP_SECRET).toBe(validProdSecret);
  });

  // 4. Development/test configuration behavior
  it('allows deterministic fallback in development and test environments when omitted', () => {
    const devParsed = parseEnv({
      NODE_ENV: 'development',
      JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://localhost:5432/ptw_cmms',
    });
    expect(devParsed.SWEEP_SECRET).toBe(KNOWN_DEV_SWEEP_SECRET);

    const testParsed = parseEnv({
      NODE_ENV: 'test',
      JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://localhost:5432/ptw_cmms',
    });
    expect(testParsed.SWEEP_SECRET).toBe(KNOWN_DEV_SWEEP_SECRET);
  });

  it('accepts valid custom SWEEP_SECRET in development if at least 32 characters', () => {
    const customDev = 'custom-dev-token-for-local-debugging-32-chars!';
    const parsed = parseEnv({
      NODE_ENV: 'development',
      JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://localhost:5432/ptw_cmms',
      SWEEP_SECRET: customDev,
    });
    expect(parsed.SWEEP_SECRET).toBe(customDev);
  });
});
