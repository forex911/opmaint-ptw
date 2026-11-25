import { UserRole } from '@ptw/shared';
import { validatePermitDetails } from '@ptw/shared';
import type { TransitionContext, GuardResult } from './types.js';

export const guardNoSelfAction = (ctx: TransitionContext): GuardResult => {
  if (ctx.actor.id && ctx.permit.requesterId === ctx.actor.id) {
    return {
      ok: false,
      code: 'SELF_APPROVAL_FORBIDDEN',
      message: 'Requesters cannot approve, reject, or verify their own permits',
    };
  }
  return { ok: true };
};

export const guardRequesterOwnership = (ctx: TransitionContext): GuardResult => {
  if (ctx.actor.role === UserRole.REQUESTER && ctx.actor.id !== ctx.permit.requesterId) {
    return {
      ok: false,
      code: 'NOT_PERMIT_OWNER',
      message: 'Only the permit requester or an authorized administrator can perform this action',
    };
  }
  return { ok: true };
};

export const guardAreaOwnerAssignment = (ctx: TransitionContext): GuardResult => {
  if (ctx.actor.role === UserRole.AREA_OWNER) {
    const matchingRow = ctx.approvals.find(
      (a) =>
        a.status === 'PENDING' &&
        a.requiredRole === UserRole.AREA_OWNER &&
        (!a.requiredUserId || a.requiredUserId === ctx.actor.id)
    );
    if (!matchingRow) {
      return {
        ok: false,
        code: 'WRONG_AREA',
        message: 'Area Owner is not designated for this permit area or approval is not pending',
      };
    }
  }
  return { ok: true };
};

export const guardPendingApprovalRowExists = (ctx: TransitionContext): GuardResult => {
  if (ctx.actor.role === UserRole.ADMIN) {
    // Admin can sign off any pending approval row provided they are not the requester
    const hasAnyPending = ctx.approvals.some((a) => a.status === 'PENDING');
    if (!hasAnyPending) {
      return {
        ok: false,
        code: 'NO_PENDING_APPROVAL',
        message: 'No pending approval rows exist for this permit',
      };
    }
    return { ok: true };
  }

  const matchingPending = ctx.approvals.find(
    (a) =>
      a.status === 'PENDING' &&
      a.requiredRole === ctx.actor.role &&
      (!a.requiredUserId || a.requiredUserId === ctx.actor.id)
  );

  if (!matchingPending) {
    return {
      ok: false,
      code: 'ROLE_NOT_ALLOWED',
      message: `No pending approval row requires role '${ctx.actor.role}' for user '${ctx.actor.id}'`,
    };
  }

  return { ok: true };
};

export const guardSeparationOfDuties = (ctx: TransitionContext): GuardResult => {
  if (!ctx.actor.id) return { ok: true };

  // Check if this actor has already signed another approval row on this permit
  const alreadyApprovedOther = ctx.approvals.some(
    (a) => a.status === 'APPROVED' && a.decidedBy === ctx.actor.id
  );

  if (alreadyApprovedOther) {
    return {
      ok: false,
      code: 'DUTIES_SEPARATION_VIOLATION',
      message:
        'Separation of duties violation: user has already authorized another approval tier on this permit',
    };
  }

  return { ok: true };
};

export const guardMandatoryComment = (ctx: TransitionContext): GuardResult => {
  const comment = (ctx.payload?.comment as string)?.trim();
  if (!comment) {
    return {
      ok: false,
      code: 'MISSING_COMMENT',
      message: 'A non-empty comment or reason is strictly mandatory for this action',
    };
  }
  return { ok: true };
};

export const guardMandatoryCompletionNotes = (ctx: TransitionContext): GuardResult => {
  const notes =
    ((ctx.payload?.completionNotes || ctx.payload?.completion_notes || ctx.payload?.comment) as string)?.trim();
  if (!notes) {
    return {
      ok: false,
      code: 'MISSING_COMPLETION_NOTES',
      message: 'Completion notes are strictly mandatory when closing a permit',
    };
  }
  return { ok: true };
};

export const guardWindowDates = (ctx: TransitionContext): GuardResult => {
  const start = new Date(ctx.permit.plannedStart);
  const end = new Date(ctx.permit.plannedEnd);
  if (end <= start) {
    return {
      ok: false,
      code: 'INVALID_TIME_WINDOW',
      message: 'planned_end must be strictly greater than planned_start',
    };
  }
  return { ok: true };
};

export const guardSubmitDetails = (ctx: TransitionContext): GuardResult => {
  const validation = validatePermitDetails(
    ctx.permit.type,
    ctx.permit.details,
    'submit',
    {
      plannedStart: new Date(ctx.permit.plannedStart),
      plannedEnd: new Date(ctx.permit.plannedEnd),
      now: ctx.now,
    }
  );

  if (!validation.valid) {
    const errorMessages = validation.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: `Permit details validation failed: ${errorMessages}`,
    };
  }
  return { ok: true };
};

export const guardActivation = (ctx: TransitionContext): GuardResult => {
  const now = ctx.now;
  const start = new Date(ctx.permit.plannedStart);
  const end = new Date(ctx.permit.plannedEnd);

  if (now < start) {
    return {
      ok: false,
      code: 'EARLY_ACTIVATION',
      message: `Cannot activate permit before planned_start (${start.toISOString()})`,
    };
  }

  if (now >= end) {
    return {
      ok: false,
      code: 'PERMIT_EXPIRED',
      message: `Cannot activate permit after planned_end (${end.toISOString()}); permit is expired`,
    };
  }

  // All approval rows must be APPROVED
  const hasPendingOrRejected = ctx.approvals.some((a) => a.status !== 'APPROVED');
  if (ctx.approvals.length === 0 || hasPendingOrRejected) {
    return {
      ok: false,
      code: 'PENDING_APPROVALS',
      message: 'Cannot activate permit: all required approval tiers must be APPROVED',
    };
  }

  // Confined Space atmospheric re-verification freshness check (D-010)
  if (ctx.permit.type === 'CONFINED_SPACE') {
    const details = ctx.permit.details as Record<string, any>;
    const testedAtStr = details?.atmosphere_test?.tested_at;
    if (!testedAtStr) {
      return {
        ok: false,
        code: 'STALE_GAS_TEST',
        message: 'Atmospheric test readings with tested_at timestamp are missing',
      };
    }

    const testedAt = new Date(testedAtStr);
    const ageMinutes = (now.getTime() - testedAt.getTime()) / (60 * 1000);

    if (ageMinutes < 0 || ageMinutes > 60) {
      return {
        ok: false,
        code: 'STALE_GAS_TEST',
        message: `Atmospheric test is ${Math.round(ageMinutes)} minutes old. Gas test must be re-verified within 60 minutes of activation`,
      };
    }
  }

  return { ok: true };
};

export const guardNotExpired = (ctx: TransitionContext): GuardResult => {
  const now = ctx.now;
  const end = new Date(ctx.permit.plannedEnd);

  if (now >= end) {
    return {
      ok: false,
      code: 'PERMIT_EXPIRED',
      message: `Permit planned window ended at ${end.toISOString()}; permit is expired`,
    };
  }
  return { ok: true };
};
