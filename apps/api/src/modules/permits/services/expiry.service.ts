import type { Pool } from 'pg';
import { transition } from '../state-machine/transition-engine.js';
import { PermitStatus } from '@ptw/shared';

export interface BulkExpiryResult {
  /** Number of eligible candidate permit records examined and row-locked during this sweep cycle */
  scanned: number;
  /** Number of permits successfully transitioned to EXPIRED */
  expiredCount: number;
  /** IDs of permits successfully transitioned to EXPIRED by this execution */
  expiredPermitIds: string[];
}

/**
 * Scans and lazily expires all overdue permits across the database.
 * Evaluates expirable statuses (PENDING_APPROVAL, APPROVED, ACTIVE, SUSPENDED)
 * whose planned_end has passed, updating status to EXPIRED and recording
 * automated system audit log entries.
 *
 * Transaction & Concurrency Guarantees:
 * - Begins an outer transaction holding candidate locks with SELECT ... FOR UPDATE SKIP LOCKED.
 * - Locks remain held until all transitions and audit insertions commit.
 * - Concurrent sweeper instances skip rows locked by other instances, preventing duplicate audit logs.
 * - Each candidate transition uses savepoints, ensuring failure on one permit rolls back that permit
 *   without leaving a transitioned permit missing its audit row.
 */
export async function bulkExpireOverduePermits(
  pool: Pool,
  now: Date = new Date()
): Promise<BulkExpiryResult> {
  const client = await pool.connect();
  const expiredPermitIds: string[] = [];
  let candidateIds: string[] = [];

  try {
    await client.query('BEGIN');

    // 1. Select and lock candidate rows with FOR UPDATE SKIP LOCKED.
    // The row-level locks remain held on this client connection throughout all
    // transitions and audit log writes until the outer COMMIT.
    const res = await client.query(
      `SELECT id 
       FROM permits 
       WHERE status IN ($1, $2, $3, $4) 
         AND planned_end <= $5
       ORDER BY planned_end ASC
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

    // 2. Transition each locked candidate using the shared client (with savepoints)
    for (const id of candidateIds) {
      try {
        await transition(
          id,
          'expire',
          { id: null, role: 'SYSTEM' },
          { comment: 'Automated bulk lazy expiry: planned_end window elapsed' },
          { client, now }
        );
        expiredPermitIds.push(id);
      } catch (transitionErr) {
        // Individual permit savepoint was rolled back inside transition(); continue with remaining
      }
    }

    // 3. Atomically commit all successful transitions and audit rows, releasing row locks
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    scanned: candidateIds.length,
    expiredCount: expiredPermitIds.length,
    expiredPermitIds,
  };
}
