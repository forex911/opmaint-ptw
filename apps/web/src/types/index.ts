import type { UserRole, PermitStatus, PermitAction, PermitTypeCode } from '@ptw/shared';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  plantId: string | null;
  department?: string | null;
  active: boolean;
  createdAt: string;
}

export interface Plant {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  active: boolean;
}

export interface Area {
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

export interface Equipment {
  id: string;
  areaId: string;
  name: string;
  tagNo: string;
  description?: string | null;
  active: boolean;
}

export interface PermitApproval {
  id: string;
  permitId: string;
  requiredRole: UserRole;
  assignedUserId: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedAt: string | null;
  approverId: string | null;
  comment: string | null;
  signatureUrl: string | null;
  approver?: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  } | null;
}

export interface PermitWorkLog {
  id: string;
  permitId: string;
  authorId: string;
  entryType: 'PROGRESS' | 'GAS_TEST' | 'INCIDENT' | 'NOTE';
  notes: string;
  createdAt: string;
  author?: {
    id: string;
    name: string;
    role: UserRole;
  } | null;
}

export interface AuditLogEntry {
  id: string;
  permitId: string;
  action: string;
  actorId: string | null;
  fromStatus: PermitStatus | null;
  toStatus: PermitStatus | null;
  comment: string | null;
  fieldDiffs: Array<{ field: string; from: unknown; to: unknown }> | null;
  ipAddress: string | null;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    role: UserRole;
  } | null;
}

export interface Permit {
  id: string;
  permitNo: string;
  type: PermitTypeCode;
  status: PermitStatus;
  requesterId: string;
  plantId: string;
  areaId: string;
  equipmentId: string;
  contractorTeam: string;
  workDescription: string;
  plannedStart: string;
  plannedEnd: string;
  hazards: string[];
  ppe: string[];
  precautions: string[];
  details: Record<string, unknown>;
  version: number;
  completionNotes: string | null;
  closureVerifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Associated entities populated by endpoints
  requester?: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
  plant?: Plant;
  area?: Area;
  equipment?: Equipment;
  approvals?: PermitApproval[];
  workLogs?: PermitWorkLog[];
  auditLogs?: AuditLogEntry[];
}

export interface PermitDetailResponse {
  permit: Permit;
  approvals: PermitApproval[];
  allowedActions: PermitAction[];
  workLogs: PermitWorkLog[];
  auditTimeline: AuditLogEntry[];
}

export interface PermitListQuery {
  page?: number;
  limit?: number;
  status?: PermitStatus | string;
  type?: PermitTypeCode | string;
  areaId?: string;
  plantId?: string;
  search?: string;
  from?: string;
  to?: string;
  mine?: boolean;
  pendingMyApproval?: boolean;
  sortBy?: 'created_at' | 'planned_start' | 'planned_end' | 'permit_no' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface PermitListResponse {
  permits: Permit[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface DashboardStats {
  total: number;
  byStatus: Record<PermitStatus, number>;
  activeRightNow: number;
  expiringIn2Hours: number;
  pendingMyApproval: number;
}
