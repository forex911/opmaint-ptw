import React from 'react';
import { AlertCircle } from 'lucide-react';
import { ApiError } from '../../api/client.js';

export interface ParsedAdminError {
  code?: string;
  message: string;
  detailsList: string[];
}

export function parseAdminApiError(err: unknown): ParsedAdminError {
  if (!(err instanceof ApiError)) {
    return {
      message: err instanceof Error ? err.message : 'An unexpected error occurred',
      detailsList: [],
    };
  }

  const detailsList: string[] = [];
  const rawDetails = err.details as Record<string, unknown> | unknown[] | undefined;

  if (rawDetails && typeof rawDetails === 'object') {
    if (Array.isArray(rawDetails)) {
      rawDetails.forEach((item: any) => {
        if (item?.message) {
          const path = Array.isArray(item.path) && item.path.length > 0 ? `${item.path.join('.')}: ` : '';
          detailsList.push(`${path}${item.message}`);
        }
      });
    } else {
      if (Array.isArray(rawDetails.areas)) {
        rawDetails.areas.forEach((a: any) => {
          detailsList.push(`Area: ${a.code || ''} — ${a.name || ''}`.trim());
        });
      }
      if (Array.isArray(rawDetails.equipment)) {
        rawDetails.equipment.forEach((eq: any) => {
          detailsList.push(`Equipment: ${eq.tag || ''} — ${eq.name || ''}`.trim());
        });
      }
      if (Array.isArray(rawDetails.permits)) {
        rawDetails.permits.forEach((p: any) => {
          detailsList.push(`${p.permitNo} (${p.status})`);
        });
      } else if (Array.isArray(rawDetails.permitNos)) {
        rawDetails.permitNos.forEach((no: any) => {
          detailsList.push(String(no));
        });
      }

      Object.entries(rawDetails).forEach(([key, val]) => {
        if (['areas', 'equipment', 'permits', 'permitNos'].includes(key)) return;
        if (Array.isArray(val)) {
          val.forEach((msg) => detailsList.push(`${key}: ${String(msg)}`));
        } else if (typeof val === 'string' && val.trim()) {
          detailsList.push(`${key}: ${val}`);
        }
      });
    }
  }

  return {
    code: err.code,
    message: err.message || 'Operation failed',
    detailsList,
  };
}

export const AdminErrorAlert: React.FC<{ error: ParsedAdminError | null }> = ({ error }) => {
  if (!error) return null;

  return (
    <div
      role="alert"
      className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5"
    >
      <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold leading-snug">
          {error.code && (
            <span className="font-mono text-[11px] bg-red-100 text-red-900 px-1.5 py-0.5 rounded mr-1.5">
              {error.code}
            </span>
          )}
          {error.message}
        </p>
        {error.detailsList.length > 0 && (
          <ul className="list-disc pl-4 space-y-0.5 text-red-700">
            {error.detailsList.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export const ActiveStatusBadge: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  return isActive ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-[#15803D]">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-600">
      Inactive
    </span>
  );
};

const ROLE_BADGE_MAP: Record<string, string> = {
  REQUESTER: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  AREA_OWNER: 'bg-blue-50 text-blue-800 border-blue-200',
  SAFETY_OFFICER: 'bg-amber-50 text-amber-800 border-amber-200',
  ADMIN: 'bg-purple-50 text-purple-800 border-purple-200',
};

export const RoleBadge: React.FC<{ role: string }> = ({ role }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-mono font-semibold ${
      ROLE_BADGE_MAP[role] || 'bg-slate-100 text-slate-700 border-slate-200'
    }`}
  >
    {role}
  </span>
);

export function generateSecurePassword(length = 16): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => charset[b % charset.length]).join('');
}
