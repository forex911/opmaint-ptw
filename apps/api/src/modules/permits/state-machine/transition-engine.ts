import pkg from 'pg';
import { getPool } from '../../../db/client.js';
import type { Permit } from '../../../db/schema/permits.js';
import type { PermitApproval } from '../../../db/schema/approvals.js';
import { UserRole, PermitStatus, getPermitTypeConfig } from '@ptw/shared';
import { AppError } from '../../../errors/app-error.js';
import { createGuardAppError } from '../../../errors/guard-codes.js';
import type {
  PermitAction,
  TransitionActor,
  TransitionContext,
  TransitionRule,
} from './types.js';
import { TRANSITION_TABLE, getAllowedActions } from './transitions.js';

export interface TransitionOptions {
  now?: Date;
  client?: pkg.PoolClient;
}

export interface TransitionPayload {
  comment?: string;
  completionNotes?: string;
  completion_notes?: string;
  signatureData?: string;
  signature_data?: string;
  [key: string]: unknown;
}

/**
 * Maps raw database snake_case permit row to typed Permit object.
 */
export function mapPermitRow(row: any): Permit {
  return {
    id: row.id,
    permitNo: row.permit_no,
    type: row.type,
    status: row.status,
    requesterId: row.requester_id,
    contractorTeam: row.contractor_team,
    workDescription: row.work_description,
    plantId: row.plant_id,
    areaId: row.area_id,
    equipmentId: row.equipment_id,
    plannedStart: new Date(row.planned_start),
    plannedEnd: new Date(row.planned_end),
    hazards: row.hazards || [],
    ppe: row.ppe || [],
    details: row.details || {},
    version: row.version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completionNotes: row.completion_notes,
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
  };
}

/**
 * Maps raw database snake_case permit_approval row to typed PermitApproval object.
 */
function mapApprovalRow(row: any): PermitApproval {
  return {
    id: row.id,
    permitId: row.permit_id,
    requiredRole: row.required_role,
    requiredUserId: row.required_user_id,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at ? new Date(row.decided_at) : null,
    comment: row.comment,
    signatureData: row.signature_data,
  };
}

/**
 * Central State Machine Transition Engine.
 * Executes in a single database transaction with SELECT ... FOR UPDATE row-level locking.
 * Enforces lazy expiry, evaluates pure guards, creates approvals, applies status transitions,
 * and records immutable audit log rows in the same transaction.
 */
export async function transition(
  permitId: string,
  action: PermitAction,
  actor: TransitionActor,
  payload: TransitionPayload = {},
  options: TransitionOptions = {}
): Promise<Permit> {
  const pool = getPool();
  const client = options.client || (await pool.connect());
  const isDedicatedClient = !options.client;
  const now = options.now || new Date();
  const savepointName = `sp_${permitId.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const rollback = async () => {
    if (isDedicatedClient) {
      await client.query('ROLLBACK');
    } else {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    }
  };

  const commit = async () => {
    if (isDedicatedClient) {
      await client.query('COMMIT');
    } else {
      await client.query(`RELEASE SAVEPOINT ${savepointName}`);
    }
  };

  try {
    if (isDedicatedClient) {
      await client.query('BEGIN');
    } else {
      await client.query(`SAVEPOINT ${savepointName}`);
    }

    // 1. SELECT ... FOR UPDATE row lock on the permit
    const permitRes = await client.query(
      'SELECT * FROM permits WHERE id = $1 FOR UPDATE',
      [permitId]
    );

    if (permitRes.rows.length === 0) {
      await rollback();
      throw AppError.notFound(`Permit with ID '${permitId}' not found`);
    }

    let permit = mapPermitRow(permitRes.rows[0]);

    // 2. Fetch current approval rows
    const approvalsRes = await client.query(
      'SELECT * FROM permit_approvals WHERE permit_id = $1 ORDER BY id ASC',
      [permitId]
    );
    let approvals: PermitApproval[] = approvalsRes.rows.map(mapApprovalRow);

    // 3. Persistent Lazy Expiry Check
    // If permit is in an expirable state and planned_end has passed, transition to EXPIRED
    const expirableStatuses: readonly string[] = [
      PermitStatus.PENDING_APPROVAL,
      PermitStatus.APPROVED,
      PermitStatus.ACTIVE,
      PermitStatus.SUSPENDED,
    ];
    const isExpirable = expirableStatuses.includes(permit.status);

    if (isExpirable && now >= permit.plannedEnd) {
      // Execute lazy expiry and commit to database
      const previousStatus = permit.status;
      const expireUpdateRes = await client.query(
        `UPDATE permits
         SET status = $1, version = version + 1, updated_at = $2
         WHERE id = $3
         RETURNING *`,
        [PermitStatus.EXPIRED, now, permitId]
      );
      permit = mapPermitRow(expireUpdateRes.rows[0]);

      // Record audit log for automated lazy expiry (actor_id NULL per D-018)
      await client.query(
        `INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment, created_at)
         VALUES ($1, NULL, $2, $3, $4, $5, $6)`,
        [
          permitId,
          'expire',
          JSON.stringify({ status: previousStatus }),
          JSON.stringify({ status: PermitStatus.EXPIRED }),
          'Automated lazy expiry: planned_end window elapsed',
          now,
        ]
      );

      // Commit the EXPIRED state so it persists permanently in PostgreSQL
      await commit();

      // If the caller requested an action other than 'expire', return 409 ILLEGAL_TRANSITION
      if (action !== 'expire') {
        const allowedActions = getAllowedActions(permit, actor, approvals, now);
        throw new AppError(
          409,
          'ILLEGAL_TRANSITION',
          `Permit has expired (planned_end was ${permit.plannedEnd.toISOString()}) and cannot execute action '${action}'`,
          {
            from: previousStatus,
            to: PermitStatus.EXPIRED,
            action,
            allowedActions,
          }
        );
      }

      return permit;
    }

    // 4. Match transition rule in declarative transition table
    const rulesForActionFromStatus = TRANSITION_TABLE.filter(
      (rule) =>
        rule.action === action &&
        rule.from.includes(permit.status as PermitStatus)
    );

    if (rulesForActionFromStatus.length === 0) {
      await rollback();
      const allowedActions = getAllowedActions(permit, actor, approvals, now);
      throw new AppError(
        409,
        'ILLEGAL_TRANSITION',
        `Action '${action}' is not permitted from status '${permit.status}'`,
        {
          from: permit.status,
          action,
          allowedActions,
        }
      );
    }

    const matchedRule: TransitionRule | undefined = rulesForActionFromStatus.find(
      (rule) => (rule.allowedRoles as string[]).includes(actor.role)
    );

    if (!matchedRule) {
      await rollback();
      const allowedActions = getAllowedActions(permit, actor, approvals, now);
      throw new AppError(
        403,
        'ROLE_NOT_ALLOWED',
        `Role '${actor.role}' is not authorized to perform action '${action}' on permits in status '${permit.status}'`,
        {
          from: permit.status,
          action,
          role: actor.role,
          allowedActions,
        }
      );
    }

    // 5. Evaluate pure guards
    const ctx: TransitionContext = {
      permit,
      action,
      actor,
      payload,
      approvals,
      now,
    };

    for (const guard of matchedRule.guards) {
      const guardResult = guard(ctx);
      if (!guardResult.ok) {
        await rollback();
        const allowedActions = getAllowedActions(permit, actor, approvals, now);
        throw createGuardAppError(guardResult.code, guardResult.message, {
          from: permit.status,
          action,
          allowedActions,
        });
      }
    }

    // 6. Execute action-specific side effects
    let nextStatus: PermitStatus = (matchedRule.to || permit.status) as PermitStatus;
    let auditComment = payload.comment || null;

    if (action === 'submit') {
      // Look up area owner for area snapshot (D-014)
      const areaRes = await client.query(
        'SELECT owner_id FROM areas WHERE id = $1',
        [permit.areaId]
      );
      const areaOwnerId = areaRes.rows[0]?.owner_id || null;

      // Create Area Owner approval tier (snapshot required_user_id)
      await client.query(
        `INSERT INTO permit_approvals (permit_id, required_role, required_user_id, status)
         VALUES ($1, $2, $3, 'PENDING')`,
        [permitId, UserRole.AREA_OWNER, areaOwnerId]
      );

      // Create Safety Officer approval tier (generic role)
      await client.query(
        `INSERT INTO permit_approvals (permit_id, required_role, required_user_id, status)
         VALUES ($1, $2, NULL, 'PENDING')`,
        [permitId, UserRole.SAFETY_OFFICER]
      );

      // Check type-specific registry requirements
      const typeConfig = getPermitTypeConfig(permit.type);
      if (typeConfig?.requiredApproverRoles) {
        for (const extraRole of typeConfig.requiredApproverRoles) {
          if (
            extraRole !== UserRole.AREA_OWNER &&
            extraRole !== UserRole.SAFETY_OFFICER
          ) {
            await client.query(
              `INSERT INTO permit_approvals (permit_id, required_role, required_user_id, status)
               VALUES ($1, $2, NULL, 'PENDING')`,
              [permitId, extraRole]
            );
          }
        }
      }

      nextStatus = PermitStatus.PENDING_APPROVAL;
    } else if (action === 'approve') {
      // Find matching pending approval row for this actor
      let targetRow: PermitApproval | undefined;
      if (actor.role === UserRole.AREA_OWNER) {
        targetRow = approvals.find(
          (a) =>
            a.status === 'PENDING' &&
            a.requiredRole === UserRole.AREA_OWNER &&
            (!a.requiredUserId || a.requiredUserId === actor.id)
        );
      } else if (actor.role === UserRole.SAFETY_OFFICER) {
        targetRow = approvals.find(
          (a) => a.status === 'PENDING' && a.requiredRole === UserRole.SAFETY_OFFICER
        );
      } else if (actor.role === UserRole.ADMIN) {
        targetRow = approvals.find((a) => a.status === 'PENDING');
      }

      if (!targetRow) {
        await rollback();
        throw new AppError(409, 'NO_PENDING_APPROVAL', 'No matching pending approval row found');
      }

      // Mark approval row APPROVED
      await client.query(
        `UPDATE permit_approvals
         SET status = 'APPROVED', decided_by = $1, decided_at = $2, comment = $3, signature_data = $4
         WHERE id = $5`,
        [
          actor.id,
          now,
          payload.comment || null,
          payload.signature_data || null,
          targetRow.id,
        ]
      );

      // Check remaining pending approvals
      const checkPendingRes = await client.query(
        `SELECT count(*) AS count FROM permit_approvals WHERE permit_id = $1 AND status != 'APPROVED'`,
        [permitId]
      );
      const remainingCount = parseInt(checkPendingRes.rows[0].count, 10);

      if (remainingCount === 0) {
        // All approval rows are now APPROVED -> permit status transitions to APPROVED
        nextStatus = PermitStatus.APPROVED;
      } else {
        // Still pending other tiers -> stays in PENDING_APPROVAL
        nextStatus = PermitStatus.PENDING_APPROVAL;
      }
    } else if (action === 'reject') {
      // Mark matching pending approval row as REJECTED
      let targetRow: PermitApproval | undefined;
      if (actor.role === UserRole.AREA_OWNER) {
        targetRow = approvals.find(
          (a) =>
            a.status === 'PENDING' &&
            a.requiredRole === UserRole.AREA_OWNER &&
            (!a.requiredUserId || a.requiredUserId === actor.id)
        );
      } else if (actor.role === UserRole.SAFETY_OFFICER) {
        targetRow = approvals.find(
          (a) => a.status === 'PENDING' && a.requiredRole === UserRole.SAFETY_OFFICER
        );
      } else if (actor.role === UserRole.ADMIN) {
        targetRow = approvals.find((a) => a.status === 'PENDING');
      }

      if (targetRow) {
        await client.query(
          `UPDATE permit_approvals
           SET status = 'REJECTED', decided_by = $1, decided_at = $2, comment = $3
           WHERE id = $4`,
          [actor.id, now, payload.comment, targetRow.id]
        );
      }

      // Rejection immediately transitions permit to terminal REJECTED status
      nextStatus = PermitStatus.REJECTED;
    } else if (action === 'close') {
      const notes = (payload.completionNotes || payload.completion_notes || payload.comment) as string;
      await client.query(
        `UPDATE permits
         SET completion_notes = $1, closed_at = $2
         WHERE id = $3`,
        [notes, now, permitId]
      );
      auditComment = notes;
      nextStatus = PermitStatus.CLOSED;
    } else if (action === 'verify') {
      await client.query(
        `UPDATE permits
         SET verified_by = $1, verified_at = $2
         WHERE id = $3`,
        [actor.id, now, permitId]
      );
      nextStatus = PermitStatus.CLOSED_VERIFIED;
    }

    // 7. Update Permit Status & Increment Version
    const previousStatus = permit.status;
    const updateRes = await client.query(
      `UPDATE permits
       SET status = $1, version = version + 1, updated_at = $2
       WHERE id = $3
       RETURNING *`,
      [nextStatus, now, permitId]
    );
    const updatedPermit = mapPermitRow(updateRes.rows[0]);

    // 8. Insert Immutable Audit Log Record in the same transaction
    await client.query(
      `INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        permitId,
        actor.id,
        action,
        JSON.stringify({ status: previousStatus }),
        JSON.stringify({ status: nextStatus }),
        auditComment,
        now,
      ]
    );

    await commit();
    return updatedPermit;
  } catch (error) {
    await rollback();
    throw error;
  } finally {
    if (isDedicatedClient) {
      client.release();
    }
  }
}
