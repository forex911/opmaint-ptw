import React from 'react';
import {
  FileEdit,
  Clock,
  CheckCircle2,
  Activity,
  PauseCircle,
  XCircle,
  AlertTriangle,
  Flag,
  ShieldCheck,
  Ban,
} from 'lucide-react';
import type { PermitStatus } from '@ptw/shared';
import { PERMIT_STATUS_LABELS } from '@ptw/shared';

export interface StatusBadgeProps {
  status: PermitStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const label = PERMIT_STATUS_LABELS[status as PermitStatus] || status;

  const config: Record<
    string,
    { bg: string; text: string; border: string; icon: React.ReactNode }
  > = {
    DRAFT: {
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-300',
      icon: <FileEdit className="w-3.5 h-3.5" />,
    },
    PENDING_APPROVAL: {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-300',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
    },
    APPROVED: {
      bg: 'bg-blue-50',
      text: 'text-blue-800',
      border: 'border-blue-300',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />,
    },
    ACTIVE: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      border: 'border-emerald-300',
      icon: (
        <span className="flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
          </span>
          <Activity className="w-3.5 h-3.5 text-emerald-600" />
        </span>
      ),
    },
    SUSPENDED: {
      bg: 'bg-orange-50',
      text: 'text-orange-800',
      border: 'border-orange-300',
      icon: <PauseCircle className="w-3.5 h-3.5 text-orange-600" />,
    },
    REJECTED: {
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      border: 'border-rose-300',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-600" />,
    },
    EXPIRED: {
      bg: 'bg-gray-100',
      text: 'text-gray-700',
      border: 'border-gray-300',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-gray-500" />,
    },
    CLOSED: {
      bg: 'bg-purple-50',
      text: 'text-purple-800',
      border: 'border-purple-300',
      icon: <Flag className="w-3.5 h-3.5 text-purple-600" />,
    },
    CLOSED_VERIFIED: {
      bg: 'bg-indigo-50',
      text: 'text-indigo-800',
      border: 'border-indigo-300',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />,
    },
    CANCELLED: {
      bg: 'bg-zinc-100',
      text: 'text-zinc-600',
      border: 'border-zinc-300',
      icon: <Ban className="w-3.5 h-3.5 text-zinc-500" />,
    },
  };

  const style = config[status] || {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    icon: <Clock className="w-3.5 h-3.5" />,
  };

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : 'text-xs px-2.5 py-1 gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${style.bg} ${style.text} ${style.border} ${sizeClass}`}
    >
      {style.icon}
      <span>{label}</span>
    </span>
  );
};
