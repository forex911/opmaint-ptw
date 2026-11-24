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
  // Query all candidate overdue permits
  const res = await pool.query(
    `SELECT id, status 
     FROM permits 
     WHERE status IN ($1, $2, $3, $4) 
       AND planned_end <= $5`,
    [
      PermitStatus.PENDING_APPROVAL,
      PermitStatus.APPROVED,
      PermitStatus.ACTIVE,
      PermitStatus.SUSPENDED,
      now,
    ]
  );

  let expiredCount = 0;

  for (const row of res.rows) {
    try {
      await transition(
        row.id,
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
