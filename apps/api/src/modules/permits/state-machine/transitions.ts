import { UserRole, PermitStatus } from '@ptw/shared';
import type { Permit } from '../../../db/schema/permits.js';
import type { PermitApproval } from '../../../db/schema/approvals.js';
import type {
  PermitAction,
  TransitionRule,
  TransitionActor,
  TransitionContext,
} from './types.js';
import {
  guardNoSelfAction,
  guardRequesterOwnership,
  guardClosureVerifySeparation,
  guardAreaOwnerAssignment,
  guardPendingApprovalRowExists,
  guardSeparationOfDuties,
  guardMandatoryComment,
  guardMandatoryCompletionNotes,
  guardWindowDates,
  guardSubmitEquipment,
  guardSubmitDetails,
  guardActivation,
  guardNotExpired,
} from './guards.js';

export const TRANSITION_TABLE: readonly TransitionRule[] = [
  {
    action: 'submit',
    from: [PermitStatus.DRAFT],
    to: PermitStatus.PENDING_APPROVAL,
    allowedRoles: [UserRole.REQUESTER, UserRole.SAFETY_OFFICER, UserRole.ADMIN],
    guards: [
      guardRequesterOwnership,
      guardWindowDates,
      guardSubmitEquipment,
      guardSubmitDetails,
    ],
  },
  {
    action: 'approve',
    from: [PermitStatus.PENDING_APPROVAL],
    // Conditional: transitions to APPROVED if all approval rows are approved, else remains PENDING_APPROVAL
    to: PermitStatus.APPROVED,
    allowedRoles: [UserRole.AREA_OWNER, UserRole.SAFETY_OFFICER, UserRole.ADMIN],
    guards: [
      guardNoSelfAction,
      guardAreaOwnerAssignment,
      guardPendingApprovalRowExists,
      guardSeparationOfDuties,
    ],
  },
  {
    action: 'reject',
    from: [PermitStatus.PENDING_APPROVAL],
    to: PermitStatus.REJECTED,
    allowedRoles: [UserRole.AREA_OWNER, UserRole.SAFETY_OFFICER, UserRole.ADMIN],
    guards: [
      guardNoSelfAction,
      guardMandatoryComment,
      guardAreaOwnerAssignment,
      guardPendingApprovalRowExists,
    ],
  },
  {
    action: 'activate',
    from: [PermitStatus.APPROVED],
    to: PermitStatus.ACTIVE,
    allowedRoles: [UserRole.REQUESTER, UserRole.SAFETY_OFFICER, UserRole.ADMIN],
    guards: [guardRequesterOwnership, guardActivation],
  },
  {
    action: 'suspend',
    from: [PermitStatus.ACTIVE],
    to: PermitStatus.SUSPENDED,
    allowedRoles: [UserRole.SAFETY_OFFICER, UserRole.ADMIN],
    guards: [guardMandatoryComment, guardNotExpired],
  },
  {
    action: 'resume',
    from: [PermitStatus.SUSPENDED],
    to: PermitStatus.ACTIVE,
    allowedRoles: [UserRole.SAFETY_OFFICER, UserRole.ADMIN],
    guards: [guardNotExpired],
  },
  {
    action: 'close',
    from: [PermitStatus.ACTIVE],
    to: PermitStatus.CLOSED,
    allowedRoles: [UserRole.REQUESTER, UserRole.SAFETY_OFFICER, UserRole.ADMIN],
    guards: [guardRequesterOwnership, guardMandatoryCompletionNotes],
  },
  {
    action: 'verify',
    from: [PermitStatus.CLOSED],
    to: PermitStatus.CLOSED_VERIFIED,
    allowedRoles: [UserRole.SAFETY_OFFICER, UserRole.ADMIN],
    guards: [guardNoSelfAction, guardClosureVerifySeparation],
  },
  {
    action: 'cancel',
    from: [
      PermitStatus.DRAFT,
      PermitStatus.PENDING_APPROVAL,
      PermitStatus.APPROVED,
      PermitStatus.SUSPENDED,
    ],
    to: PermitStatus.CANCELLED,
    allowedRoles: [UserRole.REQUESTER, UserRole.SAFETY_OFFICER, UserRole.ADMIN],
    guards: [guardRequesterOwnership, guardMandatoryComment],
  },
  {
    action: 'expire',
    from: [
      PermitStatus.PENDING_APPROVAL,
      PermitStatus.APPROVED,
      PermitStatus.ACTIVE,
      PermitStatus.SUSPENDED,
    ],
    to: PermitStatus.EXPIRED,
    allowedRoles: ['SYSTEM', UserRole.ADMIN],
    guards: [],
  },
];

/**
 * Returns list of permitted actions for the specified actor and permit state.
 * Evaluates candidate transitions and pure guards against the provided timestamp.
 */
export function getAllowedActions(
  permit: Permit,
  actor: TransitionActor,
  approvals: PermitApproval[] = [],
  now: Date = new Date(),
  options?: { closedBy?: string | null }
): PermitAction[] {
  const allowed = new Set<PermitAction>();

  const candidateRules = TRANSITION_TABLE.filter(
    (rule) =>
      rule.from.includes(permit.status as PermitStatus) &&
      (rule.allowedRoles as string[]).includes(actor.role)
  );

  for (const rule of candidateRules) {
    const ctx: TransitionContext = {
      permit,
      action: rule.action,
      actor,
      payload: {},
      approvals,
      closedBy: options?.closedBy ?? null,
      now,
    };

    // For getAllowedActions check, we evaluate role/ownership & workflow eligibility guards,
    // skipping execution-time payload guards and submit-time field completeness validators so
    // an owner always sees Submit on their DRAFT (receiving 422 field-level guidance if incomplete).
    const isAllowed = rule.guards.every((guard) => {
      if (
        guard === guardMandatoryComment ||
        guard === guardMandatoryCompletionNotes ||
        guard === guardWindowDates ||
        guard === guardSubmitEquipment ||
        guard === guardSubmitDetails
      ) {
        return true;
      }
      const res = guard(ctx);
      return res.ok;
    });

    if (isAllowed) {
      allowed.add(rule.action);
    }
  }

  return Array.from(allowed);
}
