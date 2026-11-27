import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  RotateCcw,
  PlusCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { TypeBadge } from '../components/ui/TypeBadge.js';
import { CountdownTimer } from '../components/ui/CountdownTimer.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { PermitStatus, ALL_PERMIT_TYPE_CODES } from '@ptw/shared';

export const PermitsListPage: React.FC = () => {
  const { isRequester, isAdmin, isAreaOwner, isSafetyOfficer } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL query parameters
  const page = parseInt(searchParams.get('page') || '1', 10);
  const status = searchParams.get('status') || '';
  const type = searchParams.get('type') || '';
  const search = searchParams.get('search') || '';
  const mine = searchParams.get('mine') === 'true';
  const pendingMyApproval = searchParams.get('pendingMyApproval') === 'true';
  const areaId = searchParams.get('areaId') || '';

  // Reference data for area filter (admins see inactive areas so historical permits stay filterable)
  const { data: areasData } = useQuery({
    queryKey: ['areas', { includeInactive: isAdmin }],
    queryFn: () => api.getAreas(undefined, { includeInactive: isAdmin }),
  });

  // Query permits
  const { data, isLoading, isError } = useQuery({
    queryKey: ['permits', { page, status, type, search, mine, pendingMyApproval, areaId }],
    queryFn: () =>
      api.getPermits({
        page,
        limit: 10,
        status: status || undefined,
        type: type || undefined,
        search: search || undefined,
        mine: mine || undefined,
        pendingMyApproval: pendingMyApproval || undefined,
        areaId: areaId || undefined,
        sortBy: 'created_at',
        sortOrder: 'desc',
      }),
    refetchInterval: 15000,
  });

  const permits = data?.permits || [];
  const totalPages = Math.max(1, data?.pagination?.totalPages || data?.pages || 1);
  const totalRecords = data?.pagination?.total ?? data?.total ?? 0;

  const updateFilter = (key: string, value: string | boolean) => {
    const next = new URLSearchParams(searchParams);
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
    if (key !== 'page') {
      next.set('page', '1'); // Reset to page 1 on filter change
    }
    setSearchParams(next);
  };

  const resetFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Permit to Work Registry</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Search, filter, and track industrial permit authorizations and lifecycle states.
          </p>
        </div>

        {(isRequester || isAdmin) && (
          <Button
            variant="primary"
            size="md"
            onClick={() => navigate('/permits/new')}
            className="gap-2 self-start md:self-auto"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Permit</span>
          </Button>
        )}
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 space-y-3 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by permit # (e.g. PTW-2026-0001) or description..."
              value={search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669]"
            />
          </div>

          {/* Type Select */}
          <select
            value={type}
            onChange={(e) => updateFilter('type', e.target.value)}
            className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#059669]/20"
          >
            <option value="">All Permit Types</option>
            {ALL_PERMIT_TYPE_CODES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          {/* Area Select */}
          <select
            value={areaId}
            onChange={(e) => updateFilter('areaId', e.target.value)}
            className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#059669]/20"
          >
            <option value="">All Operational Areas</option>
            {areasData?.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code}){a.isActive === false ? ' [Inactive]' : ''}
              </option>
            ))}
          </select>

          {/* Status Select */}
          <select
            value={status}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#059669]/20"
          >
            <option value="">All Statuses</option>
            {Object.values(PermitStatus).map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Filter Toggles & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateFilter('mine', !mine)}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                mine
                  ? 'bg-[#059669] text-white border-[#059669]'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              My Requests Only
            </button>

            {(isAreaOwner || isSafetyOfficer || isAdmin) && (
              <button
                onClick={() => updateFilter('pendingMyApproval', !pendingMyApproval)}
                className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                  pendingMyApproval
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Pending My Approval
              </button>
            )}
          </div>

          {(status || type || search || mine || pendingMyApproval || areaId) && (
            <button
              onClick={resetFilters}
              className="text-slate-500 hover:text-slate-800 text-xs font-semibold flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </Card>

      {/* Permits Table / Card List */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-rose-600">
            <p className="text-sm font-semibold">Failed to load permits from API.</p>
            <p className="text-xs text-slate-500 mt-1">Please verify connection or login status.</p>
          </div>
        ) : permits.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-[#172033]">No permits match your criteria</h3>
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your search filters or create a new permit request.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B] font-semibold uppercase tracking-wider">
                  <th className="px-4 py-3">Permit No</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description & Team</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Planned Window</th>
                  <th className="px-4 py-3">Countdown</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {permits.map((permit) => (
                  <tr
                    key={permit.id}
                    onClick={() => navigate(`/permits/${permit.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-bold text-[#172033]">
                      {permit.permitNo}
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={permit.type} />
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-[#172033] line-clamp-1">
                        {permit.workDescription}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Team: {permit.contractorTeam}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={permit.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                      <div>{new Date(permit.plannedStart).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
                      <div className="text-slate-400">to {new Date(permit.plannedEnd).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
                    </td>
                    <td className="px-4 py-3">
                      <CountdownTimer plannedEnd={permit.plannedEnd} status={permit.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="px-6 py-4 bg-white border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
          <span>
            Showing <strong className="text-[#172033]">{permits.length}</strong> of{' '}
            <strong className="text-[#172033]">{totalRecords}</strong> permits
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateFilter('page', String(page - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </Button>
            <span className="font-mono font-semibold text-[#172033] px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateFilter('page', String(page + 1))}
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
