import type { Pool } from 'pg';
import { transition } from '../state-machine/transition-engine.js';
import { PermitStatus } from '@ptw/shared';

/**
 * Scans and lazily expires all overdue permits across the database.
 * Evaluates expirable statuses (PENDING_APPROVAL, APPROVED, ACTIVE, SUSPENDED)
 * whose planned_end has passed, updating status to EXPIRED and recording
 * automated system audit log entries.
 */
export async function bulkExpireOverduePermits(
  pool: Pool,
  now: Date = new Date()
): Promise<number> {
  const client = await pool.connect();
  let candidateIds: string[] = [];

  try {
    await client.query('BEGIN');
    // Lock candidate rows with SKIP LOCKED so concurrent bulk expiry calls do not select or process the same rows
    const res = await client.query(
      `SELECT id 
       FROM permits 
       WHERE status IN ($1, $2, $3, $4) 
         AND planned_end <= $5
       FOR UPDATE SKIP LOCKED`,
      [
        PermitStatus.PENDING_APPROVAL,
        PermitStatus.APPROVED,
        PermitStatus.ACTIVE,
        PermitStatus.SUSPENDED,
        now,
      ]
    );
    candidateIds = res.rows.map((r) => r.id);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  let expiredCount = 0;

  for (const id of candidateIds) {
    try {
      await transition(
        id,
        'expire',
        { id: null, role: 'SYSTEM' },
        { comment: 'Automated bulk lazy expiry: planned_end window elapsed' },
        { now }
      );
      expiredCount++;
    } catch {
      // If a concurrent transaction already transitioned or expired it, ignore error
    }
  }

  return expiredCount;
}
