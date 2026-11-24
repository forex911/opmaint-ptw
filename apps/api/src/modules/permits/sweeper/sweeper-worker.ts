import { getPool, closeDbConnection } from '../../../db/client.js';
import { bulkExpireOverduePermits } from '../services/expiry.service.js';

async function runWorker() {
  const pool = getPool();
  try {
    const result = await bulkExpireOverduePermits(pool);
    if (process.send) {
      process.send(result);
    } else {
      console.log(JSON.stringify(result));
    }
  } finally {
    await closeDbConnection();
  }
}

runWorker()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Sweeper worker process failed:', err);
    process.exit(1);
  });
