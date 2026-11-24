import React from 'react';
import { Flame, Box, ArrowUpRight, Zap } from 'lucide-react';
import type { PermitTypeCode } from '@ptw/shared';

export interface TypeBadgeProps {
  type: PermitTypeCode | string;
  showIconOnly?: boolean;
}

export const TypeBadge: React.FC<TypeBadgeProps> = ({ type, showIconOnly = false }) => {
  const config: Record<
    string,
    { label: string; icon: React.ReactNode; bg: string; text: string }
  > = {
    HOT_WORK: {
      label: 'Hot Work',
      icon: <Flame className="w-4 h-4 text-amber-600" />,
      bg: 'bg-amber-100',
      text: 'text-amber-900',
    },
    CONFINED_SPACE: {
      label: 'Confined Space',
      icon: <Box className="w-4 h-4 text-blue-600" />,
      bg: 'bg-blue-100',
      text: 'text-blue-900',
    },
    WORKING_AT_HEIGHT: {
      label: 'Working at Height',
      icon: <ArrowUpRight className="w-4 h-4 text-emerald-600" />,
      bg: 'bg-emerald-100',
      text: 'text-emerald-900',
    },
    ELECTRICAL_LOTO: {
      label: 'Electrical LOTO',
      icon: <Zap className="w-4 h-4 text-purple-600" />,
      bg: 'bg-purple-100',
      text: 'text-purple-900',
    },
  };

  const item = config[type] || {
    label: type,
    icon: <Flame className="w-4 h-4 text-slate-600" />,
    bg: 'bg-slate-100',
    text: 'text-slate-800',
  };

  if (showIconOnly) {
    return (
      <span
        title={item.label}
        className={`inline-flex items-center justify-center p-1.5 rounded-lg ${item.bg}`}
      >
        {item.icon}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-[#172033] border border-slate-200">
      {item.icon}
      <span>{item.label}</span>
    </span>
  );
};
