import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import cron from 'node-cron';

// Load .env file from root or local api folder if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
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
  SWEEP_SECRET: z.string().min(32, 'SWEEP_SECRET must be at least 32 characters long').default('sweep-secret-cron-token-industrial-ptw!'),
  SWEEP_CRON_SCHEDULE: z
    .string()
    .default('* * * * *')
    .refine((val) => cron.validate(val), {
      message: 'SWEEP_CRON_SCHEDULE must be a valid cron expression (e.g. "* * * * *")',
    }),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

try {
  parsedEnv = envSchema.parse(process.env);
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
