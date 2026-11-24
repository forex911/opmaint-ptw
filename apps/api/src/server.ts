import { app } from './app.js';
import { env } from './config/env.js';
import { closeDbConnection } from './db/client.js';

export function startServer() {
  const server = app.listen(env.PORT, () => {
    console.log(`🚀 PTW CMMS API running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);
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
