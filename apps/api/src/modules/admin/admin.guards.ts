import { UserRole } from '@ptw/shared';
import { createGuardAppError } from '../../errors/guard-codes.js';
import { AppError } from '../../errors/app-error.js';

export interface AdminGuardResult {
  ok: boolean;
  code?: string;
  message?: string;
  details?: unknown;
}

export interface AdminTargetUserState {
  id: string;
  role: string;
  isActive: boolean;
}

export interface OwnedAreaRef {
  id: string;
  code: string;
  name: string;
  plantId: string;
}

export interface OpenPermitRef {
  id: string;
  permitNo: string;
  status: string;
}

export interface ActiveChildRef {
  id: string;
  code?: string;
  tag?: string;
  name: string;
}

/**
 * Prevents an administrator from demoting themselves from ADMIN or deactivating their own account.
 */
export function guardCannotModifySelf(params: {
  actorId: string;
  targetUser: AdminTargetUserState;
  nextRole?: string;
  nextIsActive?: boolean;
}): AdminGuardResult {
  const { actorId, targetUser, nextRole, nextIsActive } = params;
  if (actorId !== targetUser.id) {
    return { ok: true };
  }

  const isDemotingSelf =
    nextRole !== undefined && nextRole !== UserRole.ADMIN && targetUser.role === UserRole.ADMIN;
  const isDeactivatingSelf = nextIsActive === false;

  if (isDemotingSelf || isDeactivatingSelf) {
    return {
      ok: false,
      code: 'CANNOT_MODIFY_SELF',
      message: 'Administrators cannot demote or deactivate their own account',
    };
  }

  return { ok: true };
}

/**
 * Prevents removing or deactivating the last active administrator in the system.
 */
export function guardNotLastAdmin(params: {
  targetUser: AdminTargetUserState;
  activeAdminCount: number;
  nextRole?: string;
  nextIsActive?: boolean;
}): AdminGuardResult {
  const { targetUser, activeAdminCount, nextRole, nextIsActive } = params;

  const isCurrentlyActiveAdmin = targetUser.role === UserRole.ADMIN && targetUser.isActive;
  if (!isCurrentlyActiveAdmin) {
    return { ok: true };
  }

  const wouldLoseAdminRole = nextRole !== undefined && nextRole !== UserRole.ADMIN;
  const wouldDeactivate = nextIsActive === false;

  if ((wouldLoseAdminRole || wouldDeactivate) && activeAdminCount <= 1) {
    return {
      ok: false,
      code: 'LAST_ADMIN',
      message: 'Cannot demote or deactivate the last active system administrator',
    };
  }

  return { ok: true };
}

/**
 * Blocks removing AREA_OWNER role or deactivating an area owner while they still own areas.
 */
export function guardReassignAreasBeforeRoleOrDeactivate(params: {
  targetUser: AdminTargetUserState;
  ownedAreas: readonly OwnedAreaRef[];
  nextRole?: string;
  nextIsActive?: boolean;
}): AdminGuardResult {
  const { targetUser, ownedAreas, nextRole, nextIsActive } = params;
  if (ownedAreas.length === 0) {
    return { ok: true };
  }

  const removesAreaOwnerRole =
    targetUser.role === UserRole.AREA_OWNER &&
    nextRole !== undefined &&
    nextRole !== UserRole.AREA_OWNER;
  const deactivatesOwner = nextIsActive === false;

  if (removesAreaOwnerRole || deactivatesOwner) {
    return {
      ok: false,
      code: 'REASSIGN_AREAS_FIRST',
      message: `Reassign owned areas (${ownedAreas.map((a) => a.code).join(', ')}) before changing role or deactivating this user`,
      details: {
        areas: ownedAreas.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          plantId: a.plantId,
        })),
      },
    };
  }

  return { ok: true };
}

/**
 * Ensures any assigned area owner exists, holds role AREA_OWNER, and is active.
 */
export function guardActiveAreaOwner(candidate: AdminTargetUserState | null | undefined): AdminGuardResult {
  if (!candidate) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Selected area owner does not exist',
      details: { ownerId: ['Selected area owner does not exist'] },
    };
  }

  if (candidate.role !== UserRole.AREA_OWNER) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Area owner must have the AREA_OWNER role',
      details: { ownerId: ['Assigned owner must hold the AREA_OWNER role'] },
    };
  }

  if (!candidate.isActive) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Assigned area owner account is inactive',
      details: { ownerId: ['Assigned area owner must be an active user'] },
    };
  }

  return { ok: true };
}

/**
 * Blocks deactivating an entity referenced by non-terminal permits.
 */
export function guardNoOpenPermits(
  entityLabel: 'Plant' | 'Area' | 'Equipment',
  openPermits: readonly OpenPermitRef[]
): AdminGuardResult {
  if (openPermits.length === 0) {
    return { ok: true };
  }

  const permitNos = openPermits.map((p) => p.permitNo);
  return {
    ok: false,
    code: 'HAS_OPEN_PERMITS',
    message: `${entityLabel} cannot be deactivated while referenced by non-terminal permits: ${permitNos.join(', ')}`,
    details: {
      permitNos,
      permits: openPermits.map((p) => ({
        id: p.id,
        permitNo: p.permitNo,
        status: p.status,
      })),
    },
  };
}

/**
 * Blocks deactivating a parent entity while active child entities still exist (no cascade).
 */
export function guardNoActiveChildren(
  entityLabel: 'Plant' | 'Area',
  childLabel: 'areas' | 'equipment',
  activeChildren: readonly ActiveChildRef[]
): AdminGuardResult {
  if (activeChildren.length === 0) {
    return { ok: true };
  }

  const labels = activeChildren.map((c) => c.code || c.tag || c.name);
  return {
    ok: false,
    code: 'HAS_ACTIVE_CHILDREN',
    message: `${entityLabel} cannot be deactivated while it still has active ${childLabel}: ${labels.join(', ')}`,
    details: {
      [childLabel]: activeChildren.map((c) => ({
        id: c.id,
        ...(c.code ? { code: c.code } : {}),
        ...(c.tag ? { tag: c.tag } : {}),
        name: c.name,
      })),
    },
  };
}

/**
 * Evaluates a pure guard result and throws the mapped AppError on failure.
 */
export function assertAdminGuard(result: AdminGuardResult): void {
  if (!result.ok) {
    if (result.code === 'VALIDATION_ERROR') {
      throw new AppError(422, 'VALIDATION_ERROR', result.message || 'Validation failed', result.details);
    }
    throw createGuardAppError(
      result.code || 'CONFLICT',
      result.message || 'Administrative rule violation',
      result.details
    );
  }
}
