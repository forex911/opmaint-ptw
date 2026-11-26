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
  code?: string;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  areaOwnerId?: string | null;
  active?: boolean;
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
  tag?: string;
  tagNo?: string;
  description?: string | null;
  active?: boolean;
}

export interface PermitApproval {
  id: string;
  permitId: string;
  requiredRole: UserRole;
  requiredUserId?: string | null;
  requiredUserName?: string | null;
  requiredUserEmail?: string | null;
  assignedUserId?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedBy?: string | null;
  deciderName?: string | null;
  decidedAt?: string | null;
  approvedAt?: string | null;
  approverId?: string | null;
  comment: string | null;
  signatureData?: string | null;
  signatureUrl?: string | null;
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
  loggedBy: string;
  loggedByName?: string;
  kind: 'NOTE' | 'ENTRY' | 'EXIT' | string;
  note: string;
  createdAt: string;
  // Aliases for resilience:
  authorId?: string;
  authorName?: string;
  entryType?: string;
  notes?: string;
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
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  fromValue?: string | null;
  toValue?: string | null;
  fromStatus?: PermitStatus | string | null;
  toStatus?: PermitStatus | string | null;
  comment: string | null;
  fieldDiffs?: Array<{ field: string; from: unknown; to: unknown }> | null;
  ipAddress?: string | null;
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
  plantName?: string;
  areaName?: string;
  equipmentName?: string | null;
  equipmentTag?: string | null;
  requesterName?: string;
  requesterEmail?: string;
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
  auditTimeline?: AuditLogEntry[];
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
  sortDir?: 'asc' | 'desc';
  sortOrder?: 'asc' | 'desc';
}

export interface PermitListResponse {
  permits: Permit[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  items?: Permit[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface DashboardStats {
  total: number;
  byStatus: Record<PermitStatus, number>;
  activeNow: number;
  expiringIn2h: number;
  pendingMyApproval: number;
}
