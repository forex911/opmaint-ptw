import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { api } from '../../api/client.js';
import { Button } from '../ui/Button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card.js';
import { Skeleton } from '../ui/Skeleton.js';

function formatChangeSummary(
  fromValue: Record<string, unknown> | null,
  toValue: Record<string, unknown> | null
): string {
  if (!fromValue && !toValue) return '—';
  if (!fromValue && toValue) {
    return Object.entries(toValue)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
  }
  const keys = Array.from(new Set([...Object.keys(fromValue || {}), ...Object.keys(toValue || {})]));
  const diffs = keys
    .filter((k) => JSON.stringify(fromValue?.[k]) !== JSON.stringify(toValue?.[k]))
    .map((k) => `${k}: ${String(fromValue?.[k] ?? '—')} → ${String(toValue?.[k] ?? '—')}`);
  return diffs.length > 0 ? diffs.join(' | ') : JSON.stringify(toValue);
}

const ACTION_BADGE_MAP: Record<string, string> = {
  CREATE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  UPDATE: 'bg-blue-50 text-blue-800 border-blue-200',
  DEACTIVATE: 'bg-rose-50 text-rose-800 border-rose-200',
  REACTIVATE: 'bg-teal-50 text-teal-800 border-teal-200',
  RESET_PASSWORD: 'bg-amber-50 text-amber-800 border-amber-200',
};

export const ActivityTab: React.FC = () => {
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'activity', { entityType, page }],
    queryFn: () =>
      api.getAdminActivity({
        entityType: entityType || undefined,
        page,
        limit: 15,
      }),
  });

  const items = data?.items || [];
  const totalPages = Math.max(1, data?.pagination?.totalPages || 1);
  const total = data?.pagination?.total || 0;

  return (
    <Card>
      <CardHeader className="flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-[#059669] shrink-0 mt-1" />
          <div>
            <CardTitle>Admin Activity Audit Log</CardTitle>
            <p className="text-xs text-[#64748B] mt-0.5">
              Append-only audit trail protected by PostgreSQL row & truncate triggers.
            </p>
          </div>
        </div>

        <select
          aria-label="Filter activity by entity type"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white text-[#172033] self-start sm:self-auto"
        >
          <option value="">All Entity Types</option>
          <option value="USER">Users</option>
          <option value="PLANT">Plants</option>
          <option value="AREA">Areas</option>
          <option value="EQUIPMENT">Equipment</option>
        </select>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            No administrative audit events recorded yet.
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B] uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Timestamp</th>
                    <th className="px-6 py-3">Actor</th>
                    <th className="px-6 py-3">Entity</th>
                    <th className="px-6 py-3">Action</th>
                    <th className="px-6 py-3">Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-3 font-mono text-[#64748B] whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        <span className="font-semibold text-[#172033] block">{item.actorName}</span>
                        <span className="text-[11px] font-mono text-[#64748B]">{item.actorEmail}</span>
                      </td>
                      <td className="px-6 py-3 font-mono text-[#172033]">
                        {item.entityType}
                        <span className="block text-[10px] text-[#64748B]">
                          {item.entityId.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-mono font-semibold ${
                            ACTION_BADGE_MAP[item.action] || 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {item.action}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-[#172033] max-w-md break-words">
                        {formatChangeSummary(item.fromValue, item.toValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-200">
              {items.map((item) => (
                <div key={item.id} className="p-4 space-y-1.5 bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-mono font-semibold ${
                        ACTION_BADGE_MAP[item.action] || 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {item.entityType} · {item.action}
                    </span>
                    <span className="text-[11px] font-mono text-[#64748B]">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#172033]">{item.actorName}</p>
                  <p className="text-xs text-[#64748B] break-words">
                    {formatChangeSummary(item.fromValue, item.toValue)}
                  </p>
                </div>
              ))}
            </div>

            <div className="px-4 sm:px-6 py-3 border-t border-[#E2E8F0] bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#64748B]">
              <span>
                Page {page} of {totalPages} ({total} total entries)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
