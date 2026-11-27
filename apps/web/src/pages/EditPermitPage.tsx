import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { PermitWizard } from '../components/permits/PermitWizard.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { Button } from '../components/ui/Button.js';

interface EditLocationState {
  submitFieldErrors?: Record<string, string>;
  submitErrorMessage?: string;
}

export const EditPermitPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin } = useAuth();

  const routeState = (location.state as EditLocationState | null) ?? null;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['permit', id],
    queryFn: () => api.getPermit(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const permit = data?.permit;
  if (isError || !permit) {
    return (
      <div className="p-12 text-center text-rose-600 max-w-md mx-auto">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold">Permit Not Found or Access Denied</h2>
        <p className="text-xs text-slate-500 mt-1">
          {(error as any)?.message || 'The requested draft permit could not be loaded.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate('/permits')} className="mt-4">
          Back to Permits
        </Button>
      </div>
    );
  }

  const isOwnerOrAdmin = permit.requesterId === user?.id || isAdmin;
  const isEditableState = permit.status === 'DRAFT' || permit.status === 'PENDING_APPROVAL';

  if (!isOwnerOrAdmin || !isEditableState) {
    return (
      <div className="p-12 text-center text-amber-700 max-w-md mx-auto">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold">Permit Cannot Be Edited</h2>
        <p className="text-xs text-slate-600 mt-1">
          Only the permit owner or an administrator can edit permits in DRAFT or PENDING_APPROVAL status.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate(`/permits/${permit.id}`)} className="mt-4">
          View Permit Details
        </Button>
      </div>
    );
  }

  return (
    <PermitWizard
      mode="edit"
      initialPermit={permit}
      initialFieldErrors={routeState?.submitFieldErrors}
      initialErrorMessage={routeState?.submitErrorMessage}
    />
  );
};
