import { AppError } from './app-error.js';

/**
 * Standard mapping table from domain guard codes to HTTP status codes.
 * Ensures consistent error shapes across transition engine and API routes.
 */
export const GUARD_STATUS_MAP: Record<string, number> = {
  // 403 Forbidden: Identity / Authorization / Ownership barriers
  SELF_APPROVAL_FORBIDDEN: 403,
  WRONG_AREA: 403,
  ROLE_NOT_ALLOWED: 403,
  NOT_PERMIT_OWNER: 403,
  DUTIES_SEPARATION_VIOLATION: 403,
  FORBIDDEN_SELF_APPROVAL: 403,
  FORBIDDEN_AREA_MISMATCH: 403,
  FORBIDDEN_ROLE_MISMATCH: 403,
  FORBIDDEN_NOT_OWNER: 403,

  // 409 Conflict: Lifecycle, State Machine, Temporal barriers
  ILLEGAL_TRANSITION: 409,
  NO_PENDING_APPROVAL: 409,
  EARLY_ACTIVATION: 409,
  STALE_GAS_TEST: 409,
  PENDING_APPROVALS: 409,
  PERMIT_EXPIRED: 409,
  VERSION_CONFLICT: 409,

  // 422 Unprocessable Entity: Input validation failures
  VALIDATION_ERROR: 422,
  INVALID_TIME_WINDOW: 422,
  LOCATION_HIERARCHY_INVALID: 422,
  MISSING_COMMENT: 422,
  MISSING_COMPLETION_NOTES: 422,
};

/**
 * Converts a guard result code and message into a strongly typed AppError.
 */
export function createGuardAppError(code: string, message: string, details?: unknown): AppError {
  const status = GUARD_STATUS_MAP[code] || 409;
  return new AppError(status, code, message, details);
}
