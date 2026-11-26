import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  RotateCcw,
  Flag,
  ShieldCheck,
  Ban,
  Send,
  AlertTriangle,
  History,
  FileText,
  PlusCircle,
  MessageSquare,
  Pencil,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { Button } from '../components/ui/Button.js';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { TypeBadge } from '../components/ui/TypeBadge.js';
import { CountdownTimer } from '../components/ui/CountdownTimer.js';
import { Modal } from '../components/ui/Modal.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { DynamicFields } from '../components/permits/DynamicFields.js';
import { PERMIT_ACTION_LABELS, type PermitAction } from '@ptw/shared';

export const PermitDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  // Active dialog modal state
  const [modalAction, setModalAction] = useState<PermitAction | null>(null);
  const [commentText, setCommentText] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Work log modal state
  const [isWorkLogModalOpen, setIsWorkLogModalOpen] = useState(false);
  const [workLogNotes, setWorkLogNotes] = useState('');
  const [workLogType, setWorkLogType] = useState('NOTE');

  // Edit draft modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editWorkDescription, setEditWorkDescription] = useState('');
  const [editContractorTeam, setEditContractorTeam] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Fetch complete permit details
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['permit', id],
    queryFn: () => api.getPermit(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  // Dedicated audit timeline query
  const { data: auditData } = useQuery({
    queryKey: ['permit-audit', id],
    queryFn: () => api.getAuditTimeline(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const permit = data?.permit;
  const approvals = data?.approvals || [];
  const allowedActions = data?.allowedActions || [];
  const workLogs = data?.workLogs || [];
  const auditTimeline = auditData?.timeline || data?.auditTimeline || [];

  // Generic transition mutation
  const transitionMutation = useMutation({
    mutationFn: async ({
      action,
      comment,
      completionNotes,
    }: {
      action: PermitAction;
      comment?: string;
      completionNotes?: string;
    }) => {
      if (!id) return;
      switch (action) {
        case 'submit':
          return api.submitPermit(id, comment);
        case 'approve':
          return api.approvePermit(id, { comment });
        case 'reject':
          return api.rejectPermit(id, { comment: comment || 'Rejected during review' });
        case 'activate':
          return api.activatePermit(id, comment);
        case 'suspend':
          return api.suspendPermit(id, { comment: comment || 'Suspended for safety inspection' });
        case 'resume':
          return api.resumePermit(id, comment);
        case 'close':
          return api.closePermit(id, {
            completionNotes: completionNotes || 'Work completed and site left safe',
            comment,
          });
        case 'verify':
          return api.verifyPermit(id, comment);
        case 'cancel':
          return api.cancelPermit(id, comment);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permit', id] });
      queryClient.invalidateQueries({ queryKey: ['permit-audit', id] });
      queryClient.invalidateQueries({ queryKey: ['permits'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setModalAction(null);
      setCommentText('');
      setCompletionNotes('');
      setActionError(null);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Action failed');
    },
  });

  // Add work log mutation
  const workLogMutation = useMutation({
    mutationFn: async () => {
      if (!id || !workLogNotes.trim()) return;
      return api.addWorkLog(id, { kind: workLogType, note: workLogNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permit', id] });
      setIsWorkLogModalOpen(false);
      setWorkLogNotes('');
    },
  });

  // Edit draft mutation
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!id || !permit) return;
      return api.updatePermit(id, {
        version: permit.version,
        workDescription: editWorkDescription,
        contractorTeam: editContractorTeam,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permit', id] });
      queryClient.invalidateQueries({ queryKey: ['permit-audit', id] });
      setIsEditModalOpen(false);
      setEditError(null);
    },
    onError: (err: any) => {
      setEditError(err.message || 'Failed to update permit');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-20" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (isError || !permit) {
    return (
      <div className="p-12 text-center text-rose-600 max-w-md mx-auto">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold">Permit Not Found or Access Denied</h2>
        <p className="text-xs text-slate-500 mt-1">
          {(error as any)?.message || 'The requested permit could not be loaded.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate('/permits')} className="mt-4">
          Back to Permits
        </Button>
      </div>
    );
  }

  const renderActionButton = (action: PermitAction) => {
    const config: Record<
      PermitAction,
      { label: string; icon: React.ReactNode; variant: 'primary' | 'secondary' | 'outline' | 'destructive' }
    > = {
      submit: { label: 'Submit for Approval', icon: <Send className="w-4 h-4" />, variant: 'primary' },
      approve: { label: 'Approve Permit', icon: <CheckCircle2 className="w-4 h-4" />, variant: 'primary' },
      reject: { label: 'Reject Permit', icon: <XCircle className="w-4 h-4" />, variant: 'destructive' },
      activate: { label: 'Activate Permit', icon: <Play className="w-4 h-4" />, variant: 'primary' },
      suspend: { label: 'Suspend Work', icon: <Pause className="w-4 h-4" />, variant: 'destructive' },
      resume: { label: 'Resume Work', icon: <RotateCcw className="w-4 h-4" />, variant: 'primary' },
      close: { label: 'Mark Work Complete', icon: <Flag className="w-4 h-4" />, variant: 'primary' },
      verify: { label: 'Verify Closure & Sign Off', icon: <ShieldCheck className="w-4 h-4" />, variant: 'primary' },
      cancel: { label: 'Cancel Permit', icon: <Ban className="w-4 h-4" />, variant: 'destructive' },
      expire: { label: 'Expire', icon: <Clock className="w-4 h-4" />, variant: 'secondary' },
    };

    const item = config[action];
    if (!item || action === 'expire') return null;

    return (
      <Button
        key={action}
        variant={item.variant}
        size="md"
        onClick={() => {
          setModalAction(action);
          setActionError(null);
        }}
        className="gap-2"
      >
        {item.icon}
        <span>{item.label}</span>
      </Button>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner: Permit Header */}
      <Card className="p-6 bg-white border border-[#E2E8F0]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xl font-bold text-[#172033] bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
              {permit.permitNo}
            </span>
            <TypeBadge type={permit.type} />
            <StatusBadge status={permit.status} />
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                Window Timer
              </span>
              <CountdownTimer plannedEnd={permit.plannedEnd} status={permit.status} />
            </div>
          </div>
        </div>

        {/* Action Panel: Render strictly what backend allowedActions contains! */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Authorized Actions:</span>
            {allowedActions.length === 0 ? (
              <span className="text-xs text-slate-400 italic">
                No state actions currently available for your role.
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {allowedActions.map((action) => renderActionButton(action))}
              </div>
            )}
            {(permit.status === 'DRAFT' || permit.status === 'PENDING_APPROVAL') &&
              (permit.requesterId === user?.id || isAdmin) && (
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => {
                    setEditWorkDescription(permit.workDescription);
                    setEditContractorTeam(permit.contractorTeam);
                    setEditError(null);
                    setIsEditModalOpen(true);
                  }}
                  className="gap-2"
                >
                  <Pencil className="w-4 h-4 text-slate-600" />
                  <span>Edit Draft</span>
                </Button>
              )}
          </div>

          <div className="text-[11px] font-mono text-slate-400">
            Version: v{permit.version}
          </div>
        </div>
      </Card>

      {/* Grid: Summary & Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Job Summary */}
        <Card className="p-5 space-y-3">
          <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-[#059669]" />
            <span>Job Summary & Personnel</span>
          </h3>
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-slate-400 block font-medium">Work Description:</span>
              <p className="font-semibold text-slate-800 text-sm mt-0.5">{permit.workDescription}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <div>
                <span className="text-slate-400 block">Contractor Team:</span>
                <span className="font-semibold text-slate-800">{permit.contractorTeam}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Requester:</span>
                <span className="font-semibold text-slate-800">
                  {permit.requesterName || permit.requester?.name || 'Authorized Tech'}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Location & Time Window */}
        <Card className="p-5 space-y-3">
          <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-600" />
            <span>Facility Location & Authorized Window</span>
          </h3>
          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-slate-400 block">Plant:</span>
                <span className="font-bold text-slate-800">
                  {permit.plantName || permit.plant?.name || 'Main Facility'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Area:</span>
                <span className="font-bold text-slate-800">
                  {permit.areaName || permit.area?.name || 'Area 1'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Equipment:</span>
                <span className="font-bold text-slate-800">
                  {permit.equipmentName
                    ? `${permit.equipmentName}${permit.equipmentTag ? ` (${permit.equipmentTag})` : ''}`
                    : permit.equipment?.name || (permit.equipmentId ? 'Assigned Equipment' : 'None')}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 font-mono text-[11px]">
              <div>
                <span className="text-slate-400 block font-sans">Planned Start:</span>
                <span className="text-slate-800">{new Date(permit.plannedStart).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-sans">Planned End:</span>
                <span className="text-slate-800">{new Date(permit.plannedEnd).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Dynamic Permit Type Specific Details */}
      <Card className="p-6">
        <DynamicFields
          type={permit.type}
          values={permit.details}
          onChange={() => {}}
          readOnly={true}
        />
      </Card>

      {/* Safety Checklists: Hazards, PPE, Precautions */}
      <Card className="p-6 space-y-4">
        <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider">
          Safety Controls & Verified Precautions
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Hazards */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <span className="font-bold text-slate-800 block mb-2">Identified Hazards</span>
            {permit.hazards?.length ? (
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                {permit.hazards.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            ) : (
              <span className="text-slate-400 italic">None specified</span>
            )}
          </div>

          {/* PPE */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <span className="font-bold text-slate-800 block mb-2">Mandatory PPE</span>
            {permit.ppe?.length ? (
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                {permit.ppe.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            ) : (
              <span className="text-slate-400 italic">Standard PPE only</span>
            )}
          </div>

          {/* Precautions */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <span className="font-bold text-slate-800 block mb-2">Precautions Verified</span>
            {permit.precautions?.length ? (
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                {permit.precautions.map((pr, i) => (
                  <li key={i}>{pr}</li>
                ))}
              </ul>
            ) : (
              <span className="text-slate-400 italic">Standard site controls</span>
            )}
          </div>
        </div>
      </Card>

      {/* Multi-Party Approval Trail */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#059669]" />
            <CardTitle>Dual-Authorization Approval Trail</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                  <th className="px-6 py-3">Required Role</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Reviewer</th>
                  <th className="px-6 py-3">Decision Timestamp</th>
                  <th className="px-6 py-3">Reviewer Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {approvals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-slate-400 italic">
                      Approval rows are initialized upon permit submission.
                    </td>
                  </tr>
                ) : (
                  approvals.map((appr) => (
                    <tr key={appr.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 font-semibold text-slate-800">
                        {appr.requiredRole.replace(/_/g, ' ')}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            appr.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : appr.status === 'REJECTED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {appr.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 font-medium text-slate-800">
                        {appr.deciderName || appr.approver?.name || (appr.status === 'PENDING' ? 'Awaiting assignment' : 'System')}
                      </td>
                      <td className="px-6 py-3 font-mono text-slate-500">
                        {(appr.decidedAt || appr.approvedAt) ? new Date((appr.decidedAt || appr.approvedAt)!).toLocaleString() : '—'}
                      </td>
                      <td className="px-6 py-3 text-slate-600 italic">
                        {appr.comment || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Work Logs Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <CardTitle>Field Work Logs ({workLogs.length})</CardTitle>
            </div>
            {permit.status === 'ACTIVE' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsWorkLogModalOpen(true)}
                className="gap-1.5"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add Log Entry</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {workLogs.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-4">
              No field work logs recorded yet. Entries can be logged by technicians while permit is Active.
            </p>
          ) : (
            <div className="space-y-3">
              {workLogs.map((log) => (
                <div key={log.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 font-mono text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200">
                      {log.kind}
                    </span>
                    <span className="font-mono text-slate-400 text-[11px]">
                      {new Date(log.createdAt).toLocaleString()} by {log.loggedByName || 'Technician'}
                    </span>
                  </div>
                  <p className="text-slate-700 pt-1">{log.note}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Immutability Audit Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#059669]" />
            <CardTitle>Immutable Safety Audit Timeline</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {auditTimeline.map((entry) => {
              const actorLabel = entry.actorName
                ? `${entry.actorName} (${entry.actorRole || 'USER'})`
                : 'System';

              const formatAuditStatus = (val: unknown): string => {
                if (!val) return '';
                if (typeof val === 'string') return val;
                if (typeof val === 'object' && val !== null) {
                  if ('status' in val && typeof (val as Record<string, unknown>).status === 'string') {
                    return (val as Record<string, unknown>).status as string;
                  }
                  return JSON.stringify(val);
                }
                return String(val);
              };

              const fromStatus = formatAuditStatus(entry.fromValue);
              const toStatus = formatAuditStatus(entry.toValue);

              return (
                <div key={entry.id} className="relative group">
                  {/* Dot */}
                  <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-[#059669] ring-4 ring-white border border-[#059669]" />

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#172033] uppercase tracking-wider text-[11px]">
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono text-slate-400 text-[11px]">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-slate-600">
                      <strong>Actor:</strong> {actorLabel}
                    </p>

                    {fromStatus && toStatus && (
                      <div className="flex items-center gap-1.5 text-[11px] font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{fromStatus}</span>
                        <span>→</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">{toStatus}</span>
                      </div>
                    )}

                    {entry.comment && (
                      <p className="text-slate-700 italic bg-white p-2 rounded border border-slate-100">
                        "{entry.comment}"
                      </p>
                    )}

                    {entry.fieldDiffs && entry.fieldDiffs.length > 0 && (
                      <div className="pt-1 space-y-1 text-[11px] font-mono">
                        <span className="text-slate-400 font-sans block">Modified Fields:</span>
                        {entry.fieldDiffs.map((diff: any, idx: number) => (
                          <div key={idx} className="bg-white p-1 rounded border border-slate-100">
                            <strong>{diff.field}</strong>: {String(diff.from)} → {String(diff.to)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Action Confirmation Modal */}
      {modalAction && (
        <Modal
          isOpen={!!modalAction}
          onClose={() => setModalAction(null)}
          title={`Confirm Action: ${PERMIT_ACTION_LABELS[modalAction] || modalAction}`}
          description={`Execute state transition '${modalAction}' on permit ${permit.permitNo}.`}
        >
          {actionError && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {actionError}
            </div>
          )}

          <div className="space-y-4 text-xs">
            {modalAction === 'close' && (
              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Required Completion Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe completed work, housekeeping, locks removed, and equipment status..."
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  className="w-full p-2.5 border border-[#E2E8F0] rounded-lg text-xs"
                />
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                {modalAction === 'reject' || modalAction === 'suspend'
                  ? 'Mandatory Reason / Comment *'
                  : 'Optional Reviewer Comment'}
              </label>
              <textarea
                rows={3}
                placeholder="Enter audit comment or explanation..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="w-full p-2.5 border border-[#E2E8F0] rounded-lg text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setModalAction(null)}>
                Cancel
              </Button>
              <Button
                variant={modalAction === 'reject' || modalAction === 'suspend' || modalAction === 'cancel' ? 'destructive' : 'primary'}
                size="sm"
                isLoading={transitionMutation.isPending}
                onClick={() =>
                  transitionMutation.mutate({
                    action: modalAction,
                    comment: commentText || undefined,
                    completionNotes: completionNotes || undefined,
                  })
                }
              >
                Confirm {PERMIT_ACTION_LABELS[modalAction] || modalAction}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Work Log Modal */}
      {isWorkLogModalOpen && (
        <Modal
          isOpen={isWorkLogModalOpen}
          onClose={() => setIsWorkLogModalOpen(false)}
          title="Add Operational Work Log"
          description={`Record field progress notes or inspections for permit ${permit.permitNo}.`}
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Entry Category</label>
              <select
                value={workLogType}
                onChange={(e) => setWorkLogType(e.target.value)}
                className="w-full p-2 border border-[#E2E8F0] rounded-lg"
              >
                <option value="NOTE">General Note</option>
                <option value="ENTRY">Confined Space Entry</option>
                <option value="EXIT">Confined Space Exit</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Log Notes *</label>
              <textarea
                rows={4}
                required
                placeholder="Enter detailed field observations, measurements, or status..."
                value={workLogNotes}
                onChange={(e) => setWorkLogNotes(e.target.value)}
                className="w-full p-2.5 border border-[#E2E8F0] rounded-lg text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsWorkLogModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={workLogMutation.isPending}
                disabled={!workLogNotes.trim()}
                onClick={() => workLogMutation.mutate()}
              >
                Record Entry
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Draft Details Modal */}
      {isEditModalOpen && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Edit Permit Draft Details"
          description={`Update core information for draft permit ${permit.permitNo}. Changes are version-locked (v${permit.version}).`}
        >
          <div className="space-y-4 text-xs">
            {permit.status === 'PENDING_APPROVAL' && (
              <div className="p-3 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Approvals Will Be Reset</span>
                </div>
                <p className="text-[11px] text-amber-700">
                  Warning: Saving changes to a permit in <strong>PENDING_APPROVAL</strong> resets all existing approval tiers back to PENDING. Designated approvers will be required to re-review and re-authorize this permit.
                </p>
              </div>
            )}

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-[11px]">
              Notice: Type-specific safety requirements and gas readings are established during draft submission and cannot be altered here.
            </div>

            {editError && (
              <div className="p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                {editError}
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Work Description *</label>
              <textarea
                rows={3}
                required
                value={editWorkDescription}
                onChange={(e) => setEditWorkDescription(e.target.value)}
                className="w-full p-2.5 border border-[#E2E8F0] rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Contractor / Performing Team *</label>
              <input
                type="text"
                required
                value={editContractorTeam}
                onChange={(e) => setEditContractorTeam(e.target.value)}
                className="w-full p-2.5 border border-[#E2E8F0] rounded-lg text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={editMutation.isPending}
                disabled={!editWorkDescription.trim() || !editContractorTeam.trim()}
                onClick={() => editMutation.mutate()}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
