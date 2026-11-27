import { z } from 'zod';
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
  CANNOT_MODIFY_SELF: 'CANNOT_MODIFY_SELF',
  LAST_ADMIN: 'LAST_ADMIN',
  REASSIGN_AREAS_FIRST: 'REASSIGN_AREAS_FIRST',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  CODE_TAKEN: 'CODE_TAKEN',
  HAS_OPEN_PERMITS: 'HAS_OPEN_PERMITS',
  HAS_ACTIVE_CHILDREN: 'HAS_ACTIVE_CHILDREN',
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
// DTOs for Reference Data & Admin Management
// ---------------------------------------------------------------------------

export interface OwnedAreaSummaryDto {
  id: string;
  plantId: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  ownedAreas?: OwnedAreaSummaryDto[];
}

export interface PlantDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  areaCount?: number;
}

export interface AreaDto {
  id: string;
  plantId: string;
  code: string;
  name: string;
  ownerId: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  plantName?: string;
  plantCode?: string;
  isActive: boolean;
  equipmentCount?: number;
}

export interface EquipmentDto {
  id: string;
  areaId: string;
  tag: string;
  name: string;
  isActive: boolean;
  areaName?: string;
  areaCode?: string;
  plantId?: string;
  plantName?: string;
}

export interface AdminAuditLogDto {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  entityType: 'USER' | 'PLANT' | 'AREA' | 'EQUIPMENT' | string;
  entityId: string;
  action: string;
  fromValue: Record<string, unknown> | null;
  toValue: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminActivityResponseDto {
  items: AdminAuditLogDto[];
  pagination: PaginationMeta;
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
  requiredUserName?: string | null;
  requiredUserEmail?: string | null;
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
  fromValue: string | Record<string, unknown> | null;
  toValue: string | Record<string, unknown> | null;
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

// ---------------------------------------------------------------------------
// Zod Schemas for Runtime Contract Validation
// ---------------------------------------------------------------------------

export const auditLogEntryDtoSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  permitId: z.string().uuid(),
  actorId: z.string().uuid().nullable().optional(),
  actorName: z.string(),
  actorEmail: z.string(),
  actorRole: z.string(),
  action: z.string(),
  fromValue: z.union([z.string(), z.record(z.unknown()), z.null()]).optional(),
  toValue: z.union([z.string(), z.record(z.unknown()), z.null()]).optional(),
  comment: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).transform((v) => (typeof v === 'string' ? v : v.toISOString())),
});

export const auditTimelineResponseDtoSchema = z.object({
  timeline: z.array(auditLogEntryDtoSchema),
});

export const permitDtoSchema = z.object({
  id: z.string().uuid(),
  permitNo: z.string(),
  type: z.enum(['HOT_WORK', 'CONFINED_SPACE', 'WORKING_AT_HEIGHT', 'ELECTRICAL_LOTO'] as const),
  status: z.enum([
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'ACTIVE',
    'SUSPENDED',
    'REJECTED',
    'EXPIRED',
    'CLOSED',
    'CLOSED_VERIFIED',
    'CANCELLED',
  ] as const),
  requesterId: z.string().uuid(),
  plantId: z.string().uuid(),
  areaId: z.string().uuid(),
  equipmentId: z.string().uuid().nullable().optional(),
  contractorTeam: z.string(),
  workDescription: z.string(),
  plannedStart: z.union([z.string(), z.date()]).transform((v) => (typeof v === 'string' ? v : v.toISOString())),
  plannedEnd: z.union([z.string(), z.date()]).transform((v) => (typeof v === 'string' ? v : v.toISOString())),
  hazards: z.array(z.string()).default([]),
  ppe: z.array(z.string()).default([]),
  details: z.record(z.unknown()).default({}),
  version: z.number().int(),
  completionNotes: z.string().nullable().optional(),
  closedAt: z.union([z.string(), z.date(), z.null()]).optional(),
  verifiedBy: z.string().nullable().optional(),
  verifiedAt: z.union([z.string(), z.date(), z.null()]).optional(),
  createdAt: z.union([z.string(), z.date()]).transform((v) => (typeof v === 'string' ? v : v.toISOString())),
  updatedAt: z.union([z.string(), z.date()]).transform((v) => (typeof v === 'string' ? v : v.toISOString())),
  plantName: z.string().optional(),
  areaName: z.string().optional(),
  equipmentTag: z.string().nullable().optional(),
  equipmentName: z.string().nullable().optional(),
  requesterName: z.string().optional(),
  requesterEmail: z.string().optional(),
});

export const permitApprovalDtoSchema = z.object({
  id: z.string(),
  permitId: z.string().uuid(),
  requiredRole: z.enum(['REQUESTER', 'AREA_OWNER', 'SAFETY_OFFICER', 'ADMIN'] as const),
  requiredUserId: z.string().uuid().nullable().optional(),
  requiredUserName: z.string().nullable().optional(),
  requiredUserEmail: z.string().nullable().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED'] as const),
  decidedBy: z.string().uuid().nullable().optional(),
  deciderName: z.string().nullable().optional(),
  decidedAt: z.union([z.string(), z.date(), z.null()]).optional(),
  comment: z.string().nullable().optional(),
  signatureData: z.string().nullable().optional(),
});

export const permitWorkLogDtoSchema = z.object({
  id: z.string(),
  permitId: z.string().uuid(),
  loggedBy: z.string().uuid(),
  loggedByName: z.string().optional(),
  kind: z.string(),
  note: z.string(),
  createdAt: z.union([z.string(), z.date()]).transform((v) => (typeof v === 'string' ? v : v.toISOString())),
});

export const permitDetailResponseDtoSchema = z.object({
  permit: permitDtoSchema,
  approvals: z.array(permitApprovalDtoSchema),
  workLogs: z.array(permitWorkLogDtoSchema),
  allowedActions: z.array(z.string()),
});

