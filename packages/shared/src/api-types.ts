import type { UserRole } from './roles.js';
import type { PermitStatus, PermitAction, ApprovalStatus, WorkLogKind } from './statuses.js';
import type { PermitTypeCode } from './registry/definitions.js';

export const ApiErrorCode = {
  // 401 Unauthorized
  UNAUTHENTICATED: 'UNAUTHENTICATED',

  // 403 Forbidden
  FORBIDDEN: 'FORBIDDEN',
  SELF_APPROVAL_FORBIDDEN: 'SELF_APPROVAL_FORBIDDEN',
  WRONG_AREA: 'WRONG_AREA',
  ROLE_NOT_ALLOWED: 'ROLE_NOT_ALLOWED',
  NOT_PERMIT_OWNER: 'NOT_PERMIT_OWNER',
  DUTIES_SEPARATION_VIOLATION: 'DUTIES_SEPARATION_VIOLATION',
  // Backward compatibility aliases
  FORBIDDEN_SELF_APPROVAL: 'FORBIDDEN_SELF_APPROVAL',
  FORBIDDEN_AREA_MISMATCH: 'FORBIDDEN_AREA_MISMATCH',
  FORBIDDEN_ROLE_MISMATCH: 'FORBIDDEN_ROLE_MISMATCH',
  FORBIDDEN_NOT_OWNER: 'FORBIDDEN_NOT_OWNER',

  // 404 Not Found
  NOT_FOUND: 'NOT_FOUND',

  // 409 Conflict
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  NO_PENDING_APPROVAL: 'NO_PENDING_APPROVAL',
  EARLY_ACTIVATION: 'EARLY_ACTIVATION',
  STALE_GAS_TEST: 'STALE_GAS_TEST',
  PENDING_APPROVALS: 'PENDING_APPROVALS',
  PERMIT_EXPIRED: 'PERMIT_EXPIRED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  CONFLICT: 'CONFLICT',

  // 422 Unprocessable Entity
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_TIME_WINDOW: 'INVALID_TIME_WINDOW',
  LOCATION_HIERARCHY_INVALID: 'LOCATION_HIERARCHY_INVALID',
  MISSING_COMMENT: 'MISSING_COMMENT',
  MISSING_COMPLETION_NOTES: 'MISSING_COMPLETION_NOTES',

  // 429 Too Many Requests
  RATE_LIMITED: 'RATE_LIMITED',

  // 500 Internal Error
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ApiErrorDetail {
  path?: (string | number)[];
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode | string;
    message: string;
    details?: ApiErrorDetail | Record<string, unknown> | unknown[];
  };
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data?: T;
  meta?: PaginationMeta & Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// DTOs for Reference Data
// ---------------------------------------------------------------------------

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  plantId: string | null;
  department?: string | null;
  active: boolean;
  createdAt: string;
}

export interface PlantDto {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  active: boolean;
}

export interface AreaDto {
  id: string;
  plantId: string;
  name: string;
  code: string;
  areaOwnerId: string | null;
  active: boolean;
  areaOwner?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface EquipmentDto {
  id: string;
  areaId: string;
  name: string;
  tagNo?: string;
  tag?: string;
  description?: string | null;
  active: boolean;
}

// ---------------------------------------------------------------------------
// DTOs for Permits, Approvals, Work Logs, and Audit Logs
// ---------------------------------------------------------------------------

export interface PermitDto {
  id: string;
  permitNo: string;
  type: PermitTypeCode;
  status: PermitStatus;
  requesterId: string;
  plantId: string;
  areaId: string;
  equipmentId: string | null;
  contractorTeam: string;
  workDescription: string;
  plannedStart: string;
  plannedEnd: string;
  hazards: string[];
  ppe: string[];
  details: Record<string, unknown>;
  version: number;
  completionNotes: string | null;
  closedAt: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  plantName?: string;
  areaName?: string;
  equipmentTag?: string;
  equipmentName?: string;
  requesterName?: string;
  requesterEmail?: string;
}

export interface PermitApprovalDto {
  id: string;
  permitId: string;
  requiredRole: UserRole;
  requiredUserId: string | null;
  status: ApprovalStatus;
  decidedBy: string | null;
  deciderName?: string | null;
  decidedAt: string | null;
  comment: string | null;
  signatureData?: string | null;
}

export interface PermitWorkLogDto {
  id: string;
  permitId: string;
  loggedBy: string;
  loggedByName?: string;
  kind: WorkLogKind | string;
  note: string;
  createdAt: string;
}

export interface AuditLogEntryDto {
  id: string;
  permitId: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  comment: string | null;
  createdAt: string;
}

export interface DashboardStatsDto {
  total: number;
  byStatus: Record<PermitStatus, number>;
  activeNow: number;
  expiringIn2h: number;
  pendingMyApproval: number;
}

export interface PermitDetailResponseDto {
  permit: PermitDto;
  approvals: PermitApprovalDto[];
  workLogs: PermitWorkLogDto[];
  allowedActions: PermitAction[];
}

export interface PermitListResponseDto {
  items: PermitDto[];
  pagination: PaginationMeta;
  permits?: PermitDto[];
  total?: number;
  page?: number;
  limit?: number;
  pages?: number;
}

// ---------------------------------------------------------------------------
// Request Payloads (All Pure camelCase)
// ---------------------------------------------------------------------------

export interface CreatePermitRequest {
  type: PermitTypeCode;
  plantId: string;
  areaId: string;
  equipmentId: string;
  contractorTeam: string;
  workDescription: string;
  plannedStart: string;
  plannedEnd: string;
  hazards?: string[];
  ppe?: string[];
  details?: Record<string, unknown>;
}

export interface UpdatePermitRequest {
  version: number;
  plantId?: string;
  areaId?: string;
  equipmentId?: string | null;
  contractorTeam?: string;
  workDescription?: string;
  plannedStart?: string;
  plannedEnd?: string;
  hazards?: string[];
  ppe?: string[];
  details?: Record<string, unknown>;
}

export interface TransitionActionRequest {
  comment?: string;
  completionNotes?: string;
  signatureData?: string;
}

export interface CreateWorkLogRequest {
  kind: WorkLogKind | string;
  note: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: UserDto;
}
