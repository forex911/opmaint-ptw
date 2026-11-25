import { startServer } from './server.js';

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
