import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Clock,
  CheckCircle2,
  FileText,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../api/client.js';
import { Button } from '../components/ui/Button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { TypeBadge } from '../components/ui/TypeBadge.js';
import { CountdownTimer } from '../components/ui/CountdownTimer.js';
import { Skeleton } from '../components/ui/Skeleton.js';

export const DashboardPage: React.FC = () => {
  const { user, isRequester, isAdmin, isAreaOwner, isSafetyOfficer } = useAuth();
  const navigate = useNavigate();

  // 1. Fetch dashboard statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.getDashboardStats(),
    refetchInterval: 15000, // Poll every 15s to keep numbers fresh
  });

  // 2. Fetch Active Permits for "Active Right Now" strip
  const { data: activeData, isLoading: activeLoading } = useQuery({
    queryKey: ['permits-active'],
    queryFn: () => api.getPermits({ status: 'ACTIVE', limit: 6, sortBy: 'planned_end', sortOrder: 'asc' }),
    refetchInterval: 10000,
  });

  // 3. Fetch Permits pending approval for this role
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['permits-pending-my-approval'],
    queryFn: () => api.getPermits({ pendingMyApproval: true, limit: 5 }),
    enabled: isAreaOwner || isSafetyOfficer || isAdmin,
    refetchInterval: 15000,
  });

  // 4. Fetch recent permits
  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ['permits-recent'],
    queryFn: () => api.getPermits({ limit: 5, sortBy: 'created_at', sortOrder: 'desc' }),
  });

  const activePermits = activeData?.permits || [];
  const pendingPermits = pendingData?.permits || [];
  const recentPermits = recentData?.permits || [];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#172033]">
              Welcome back, {user?.name}
            </h1>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              {user?.role}
            </span>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Plant CMMS Permit to Work operational oversight dashboard. Current Time:{' '}
            <span className="font-mono font-medium text-slate-800">
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(isRequester || isAdmin) && (
            <Button
              variant="primary"
              size="md"
              onClick={() => navigate('/permits/new')}
              className="gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Draft New Permit</span>
            </Button>
          )}
          {(isAreaOwner || isSafetyOfficer) && (
            <Button
              variant="outline"
              size="md"
              onClick={() => navigate('/permits?pendingMyApproval=true')}
              className="gap-2"
            >
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Review Approvals ({stats?.pendingMyApproval || 0})</span>
            </Button>
          )}
        </div>
      </div>

      {/* Primary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {/* Total */}
        <Card className="p-4 border-l-4 border-l-slate-400">
          <p className="text-xs font-semibold text-[#64748B]">Total Permits</p>
          <p className="text-2xl font-bold font-mono text-[#172033] mt-1">
            {statsLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              stats?.total ?? Object.values(stats?.byStatus || {}).reduce((a, b) => a + b, 0)
            )}
          </p>
        </Card>

        {/* Active Right Now */}
        <Card className="p-4 border-l-4 border-l-emerald-500 bg-emerald-50/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-800">Active Live</p>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
            </span>
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-900 mt-1">
            {statsLoading ? <Skeleton className="h-8 w-12" /> : stats?.activeNow || 0}
          </p>
        </Card>

        {/* Pending Approvals */}
        <Card className="p-4 border-l-4 border-l-amber-500 bg-amber-50/20">
          <p className="text-xs font-semibold text-amber-800">Pending Approval</p>
          <p className="text-2xl font-bold font-mono text-amber-900 mt-1">
            {statsLoading ? <Skeleton className="h-8 w-12" /> : stats?.byStatus?.PENDING_APPROVAL || 0}
          </p>
        </Card>

        {/* Expiring Soon (<2h) */}
        <Card className="p-4 border-l-4 border-l-rose-500 bg-rose-50/20">
          <p className="text-xs font-semibold text-rose-800">Expiring in 2h</p>
          <p className="text-2xl font-bold font-mono text-rose-900 mt-1">
            {statsLoading ? <Skeleton className="h-8 w-12" /> : stats?.expiringIn2h || 0}
          </p>
        </Card>

        {/* Suspended */}
        <Card className="p-4 border-l-4 border-l-orange-500">
          <p className="text-xs font-semibold text-orange-800">Suspended</p>
          <p className="text-2xl font-bold font-mono text-orange-900 mt-1">
            {statsLoading ? <Skeleton className="h-8 w-12" /> : stats?.byStatus?.SUSPENDED || 0}
          </p>
        </Card>

        {/* Closed Verified */}
        <Card className="p-4 border-l-4 border-l-indigo-500">
          <p className="text-xs font-semibold text-indigo-800">Verified Closed</p>
          <p className="text-2xl font-bold font-mono text-indigo-900 mt-1">
            {statsLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              (stats?.byStatus?.CLOSED || 0) + (stats?.byStatus?.CLOSED_VERIFIED || 0)
            )}
          </p>
        </Card>
      </div>

      {/* Active Right Now Live Strip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
            </span>
            <h2 className="text-base font-bold text-[#172033]">
              Active Work In Progress (Live Countdown)
            </h2>
          </div>
          <Link
            to="/permits?status=ACTIVE"
            className="text-xs font-semibold text-[#2563EB] hover:underline flex items-center gap-1"
          >
            <span>View All Active ({stats?.activeNow || 0})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {activeLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : activePermits.length === 0 ? (
          <Card className="p-8 text-center text-slate-500 bg-white">
            <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600">No active permits currently in progress.</p>
            <p className="text-xs text-slate-400 mt-1">Approved permits will display live countdowns once activated.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activePermits.map((permit) => (
              <Card
                key={permit.id}
                onClick={() => navigate(`/permits/${permit.id}`)}
                className="cursor-pointer hover:border-[#2563EB] transition-all p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                      {permit.permitNo}
                    </span>
                    <CountdownTimer plannedEnd={permit.plannedEnd} status={permit.status} />
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <TypeBadge type={permit.type} />
                    <StatusBadge status={permit.status} size="sm" />
                  </div>

                  <p className="text-sm font-semibold text-[#172033] line-clamp-2 mb-2">
                    {permit.workDescription}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 text-xs text-[#64748B] flex items-center justify-between">
                  <span>Team: {permit.contractorTeam}</span>
                  <span className="font-medium text-[#2563EB]">View Details →</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dual Section: Pending My Approval & Recently Updated */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Approvals */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <CardTitle>Pending Approvals Requiring Action</CardTitle>
            </div>
            <Link
              to="/permits?pendingMyApproval=true"
              className="text-xs font-semibold text-[#2563EB] hover:underline"
            >
              View All
            </Link>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {pendingLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : pendingPermits.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">All clear! No permits pending your approval.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingPermits.map((permit) => (
                  <div
                    key={permit.id}
                    onClick={() => navigate(`/permits/${permit.id}`)}
                    className="p-4 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {permit.permitNo}
                        </span>
                        <TypeBadge type={permit.type} showIconOnly />
                      </div>
                      <p className="text-xs text-[#172033] font-medium line-clamp-1">
                        {permit.workDescription}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Review
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recently Created / Updated Permits */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2563EB]" />
              <CardTitle>Recent Activity Stream</CardTitle>
            </div>
            <Link to="/permits" className="text-xs font-semibold text-[#2563EB] hover:underline">
              View All Permits
            </Link>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {recentLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : recentPermits.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">No recent permits recorded.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentPermits.map((permit) => (
                  <div
                    key={permit.id}
                    onClick={() => navigate(`/permits/${permit.id}`)}
                    className="p-4 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {permit.permitNo}
                        </span>
                        <StatusBadge status={permit.status} size="sm" />
                      </div>
                      <p className="text-xs text-[#64748B] line-clamp-1">
                        {permit.workDescription}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(permit.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
