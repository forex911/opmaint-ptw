import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';
import { env } from '../config/env.js';

let poolInstance: pkg.Pool | null = null;

export function getPool(): pkg.Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.NODE_ENV === 'test' ? 5 : 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    poolInstance.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client pool', err);
    });
  }
  return poolInstance;
}

export const db = drizzle(getPool(), { schema });

export async function closeDbConnection(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

/**
 * Safely generates the next human-readable permit identifier using PostgreSQL sequence.
 * Format: PTW-YYYY-NNNN (e.g. PTW-2026-0001)
 */
export async function getNextPermitNumber(client: { query: (q: string) => Promise<{ rows: { permit_no: string }[] }> } = getPool()): Promise<string> {
  const result = await client.query(`
    SELECT format('PTW-%s-%s', 
      to_char(CURRENT_DATE, 'YYYY'), 
      lpad(nextval('ptw_permit_no_seq')::text, 4, '0')
    ) AS permit_no;
  `);
  const row = result.rows[0];
  if (!row?.permit_no) {
    throw new Error('Failed to generate next permit number from ptw_permit_no_seq');
  }
  return row.permit_no;
}
