import { PermitStatus, UserRole } from '@ptw/shared';
import { AppError } from '../../errors/app-error.js';
import type { TransitionActor } from './state-machine/types.js';

export interface VisibilitySubject {
  id?: string;
  status: string;
  requesterId: string;
}

/**
 * Canonical Permit Visibility Predicate (D-033 amending D-020):
 * - DRAFT permits are visible ONLY to their requester (author) and ADMIN.
 * - From PENDING_APPROVAL onward, permits remain visible to all authenticated users.
 */
export function canViewPermit(
  permit: VisibilitySubject,
  actor: TransitionActor
): boolean {
  if (permit.status !== PermitStatus.DRAFT) {
    return true;
  }
  if (actor.role === UserRole.ADMIN || actor.role === 'SYSTEM') {
    return true;
  }
  return Boolean(actor.id && permit.requesterId === actor.id);
}

/**
 * Throws HTTP 404 NOT_FOUND (not 403) when a non-owner/non-admin accesses or
 * attempts any action on another user's DRAFT permit, preventing draft discovery.
 */
export function assertPermitVisible(
  permit: VisibilitySubject,
  actor: TransitionActor
): void {
  if (!canViewPermit(permit, actor)) {
    throw AppError.notFound(
      permit.id ? `Permit with ID '${permit.id}' not found` : 'Permit not found'
    );
  }
}

/**
 * Parameterized SQL WHERE clause enforcing the canonical DRAFT visibility rule
 * across lists, search, pagination counts, dashboard statistics, and queues.
 */
export function buildPermitVisibilitySql(
  actor: TransitionActor,
  startParamIndex: number,
  alias = 'p'
): { clause: string; params: unknown[] } {
  if (actor.role === UserRole.ADMIN || actor.role === 'SYSTEM') {
    return { clause: 'TRUE', params: [] };
  }
  return {
    clause: `(${alias}.status != $${startParamIndex} OR ${alias}.requester_id = $${startParamIndex + 1})`,
    params: [PermitStatus.DRAFT, actor.id],
  };
}
