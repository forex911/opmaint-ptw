import { describe, it, expect } from 'vitest';
import { env } from './env.js';

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
});
