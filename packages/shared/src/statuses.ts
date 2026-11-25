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

export const PermitAction = {
  SUBMIT: 'submit',
  APPROVE: 'approve',
  REJECT: 'reject',
  ACTIVATE: 'activate',
  SUSPEND: 'suspend',
  RESUME: 'resume',
  CLOSE: 'close',
  VERIFY: 'verify',
  CANCEL: 'cancel',
  EXPIRE: 'expire',
} as const;

export type PermitAction = (typeof PermitAction)[keyof typeof PermitAction];

export const ALL_PERMIT_ACTIONS: readonly PermitAction[] = [
  PermitAction.SUBMIT,
  PermitAction.APPROVE,
  PermitAction.REJECT,
  PermitAction.ACTIVATE,
  PermitAction.SUSPEND,
  PermitAction.RESUME,
  PermitAction.CLOSE,
  PermitAction.VERIFY,
  PermitAction.CANCEL,
  PermitAction.EXPIRE,
] as const;

export const PERMIT_STATUS_LABELS: Record<PermitStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  CLOSED: 'Closed',
  CLOSED_VERIFIED: 'Closed (Verified)',
  CANCELLED: 'Cancelled',
};

export const PERMIT_ACTION_LABELS: Record<PermitAction, string> = {
  submit: 'Submit for Approval',
  approve: 'Approve',
  reject: 'Reject',
  activate: 'Activate',
  suspend: 'Suspend',
  resume: 'Resume',
  close: 'Complete Work',
  verify: 'Verify Closure',
  cancel: 'Cancel',
  expire: 'Expire',
};

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
