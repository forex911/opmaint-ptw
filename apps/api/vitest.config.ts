import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/ptw_cmms_test',
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/ptw_cmms_test',
      JWT_SECRET: process.env.JWT_SECRET || 'test-secret-key-that-is-at-least-32-characters-long!',
    },
  },
});
