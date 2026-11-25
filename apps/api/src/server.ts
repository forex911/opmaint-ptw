import { app } from './app.js';
import { env } from './config/env.js';
import { closeDbConnection } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { startSweeper, stopSweeper } from './modules/permits/sweeper/expiry-sweeper.js';

export async function startServer() {
  // Run pending database migrations automatically on startup
  await runMigrations();

  // Start the background expiry sweeper
  startSweeper();

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 PTW CMMS API running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);
    // Stop background sweeper and wait for any active in-flight sweep to complete
    await stopSweeper();
    server.close(async () => {
      await closeDbConnection();
      console.log('✅ PostgreSQL connection pool closed. Exiting process.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}
