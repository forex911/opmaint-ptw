import type { Permit } from '../../../db/schema/permits.js';
import type { PermitApproval } from '../../../db/schema/approvals.js';
import { UserRole, PermitStatus } from '@ptw/shared';

export type PermitAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'activate'
  | 'suspend'
  | 'resume'
  | 'close'
  | 'verify'
  | 'cancel'
  | 'expire';

export const ALL_PERMIT_ACTIONS: readonly PermitAction[] = [
  'submit',
  'approve',
  'reject',
  'activate',
  'suspend',
  'resume',
  'close',
  'verify',
  'cancel',
  'expire',
] as const;

export type GuardResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export interface TransitionActor {
  id: string | null;
  role: string;
  name?: string;
  email?: string;
}

export interface TransitionContext {
  permit: Permit;
  action: PermitAction;
  actor: TransitionActor;
  payload?: Record<string, unknown>;
  approvals: PermitApproval[];
  now: Date;
}

export type GuardFunction = (ctx: TransitionContext) => GuardResult;

export interface TransitionRule {
  action: PermitAction;
  from: readonly PermitStatus[];
  to?: PermitStatus;
  allowedRoles: readonly (UserRole | 'SYSTEM')[];
  guards: readonly GuardFunction[];
}
