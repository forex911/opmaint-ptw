export const PermitStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CLOSED: 'CLOSED',
  CLOSED_VERIFIED: 'CLOSED_VERIFIED',
  CANCELLED: 'CANCELLED',
} as const;

export type PermitStatus = (typeof PermitStatus)[keyof typeof PermitStatus];

export const ALL_PERMIT_STATUSES: readonly PermitStatus[] = [
  PermitStatus.DRAFT,
  PermitStatus.PENDING_APPROVAL,
  PermitStatus.APPROVED,
  PermitStatus.ACTIVE,
  PermitStatus.SUSPENDED,
  PermitStatus.REJECTED,
  PermitStatus.EXPIRED,
  PermitStatus.CLOSED,
  PermitStatus.CLOSED_VERIFIED,
  PermitStatus.CANCELLED,
] as const;

export const TERMINAL_PERMIT_STATUSES: readonly PermitStatus[] = [
  PermitStatus.REJECTED,
  PermitStatus.EXPIRED,
  PermitStatus.CLOSED_VERIFIED,
  PermitStatus.CANCELLED,
] as const;

export function isTerminalStatus(status: PermitStatus): boolean {
  return (TERMINAL_PERMIT_STATUSES as readonly string[]).includes(status);
}

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const WorkLogKind = {
  NOTE: 'NOTE',
  ENTRY: 'ENTRY',
  EXIT: 'EXIT',
} as const;

export type WorkLogKind = (typeof WorkLogKind)[keyof typeof WorkLogKind];

export const ExtensionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type ExtensionStatus = (typeof ExtensionStatus)[keyof typeof ExtensionStatus];
