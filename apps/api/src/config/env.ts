import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env file from root or local api folder if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').default('postgres://postgres:postgres@localhost:5432/ptw_cmms'),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long').default('super-secure-industrial-ptw-secret-key-min-32-chars-long!'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  COOKIE_NAME: z.string().default('ptw_token'),
  COOKIE_SECRET: z.string().min(16).default('cookie-secret-key-industrial-ptw!'),
  SWEEP_SECRET: z.string().min(16, 'SWEEP_SECRET must be at least 16 characters').default('sweep-secret-cron-token-industrial-ptw!'),
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
