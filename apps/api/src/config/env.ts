import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import cron from 'node-cron';

// Load .env file from root or local api folder if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const KNOWN_DEV_SWEEP_SECRET = 'sweep-secret-cron-token-industrial-ptw!';

export const baseEnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').default('postgres://ptw_app_user:ptw_app_pass@localhost:5432/ptw_cmms'),
  ADMIN_DATABASE_URL: z.string().optional(),
  APP_DB_PASSWORD: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  COOKIE_NAME: z.string().default('ptw_token'),
  COOKIE_SECRET: z.string().min(16).default('cookie-secret-key-industrial-ptw!'),
  SWEEP_SECRET: z.string().optional(),
  SWEEP_CRON_SCHEDULE: z
    .string()
    .default('* * * * *')
    .refine((val) => cron.validate(val), {
      message: 'SWEEP_CRON_SCHEDULE must be a valid cron expression (e.g. "* * * * *")',
    }),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export const envSchema = baseEnvSchema
  .superRefine((data, ctx) => {
    const isProduction = data.NODE_ENV === 'production';

    // 1. In production, SWEEP_SECRET must be explicitly provided
    if (isProduction) {
      if (!data.SWEEP_SECRET || data.SWEEP_SECRET.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SWEEP_SECRET'],
          message: 'SWEEP_SECRET is required in production and cannot fall back to a default value',
        });
        return;
      }

      // 2. In production, never permit the known dev fallback or unedited placeholders
      if (
        data.SWEEP_SECRET === KNOWN_DEV_SWEEP_SECRET ||
        data.SWEEP_SECRET.includes('YOUR_PRODUCTION_SWEEP_SECRET') ||
        data.SWEEP_SECRET.startsWith('CHANGE_ME')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SWEEP_SECRET'],
          message: 'SWEEP_SECRET in production must not use the known development fallback or placeholder secret',
        });
        return;
      }
    }

    // 3. Resolve effective secret for validation
    const effectiveSecret = data.SWEEP_SECRET || (data.NODE_ENV !== 'production' ? KNOWN_DEV_SWEEP_SECRET : '');

    // 4. Validate minimum 32-character requirement
    if (effectiveSecret.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SWEEP_SECRET'],
        message: 'SWEEP_SECRET must be at least 32 characters long',
      });
    }
  })
  .transform((data) => ({
    ...data,
    SWEEP_SECRET: data.SWEEP_SECRET || KNOWN_DEV_SWEEP_SECRET,
  }));

export type Env = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, unknown> = process.env): Env {
  return envSchema.parse(rawEnv);
}

let parsedEnv: Env;

try {
  parsedEnv = parseEnv(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const formatted = error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`❌ Invalid Environment Configuration:\n${formatted}`);
  } else {
    console.error('❌ Failed to parse environment configuration:', error);
  }
  process.exit(1);
}

export const env = parsedEnv;
