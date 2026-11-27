import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Building2, MapPin, Wrench, History, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { UsersTab } from '../components/admin/UsersTab.js';
import { PlantsTab } from '../components/admin/PlantsTab.js';
import { AreasTab } from '../components/admin/AreasTab.js';
import { EquipmentTab } from '../components/admin/EquipmentTab.js';
import { ActivityTab } from '../components/admin/ActivityTab.js';

type AdminTab = 'users' | 'plants' | 'areas' | 'equipment' | 'activity';

const VALID_TABS: AdminTab[] = ['users', 'plants', 'areas', 'equipment', 'activity'];

export const AdminPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [flashMessage, setFlashMessage] = React.useState<string | null>(null);

  const rawTab = searchParams.get('tab') as AdminTab | null;
  const activeTab: AdminTab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'users';

  const setActiveTab = (tab: AdminTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.getAdminUsers(),
  });

  const { data: plantsData, isLoading: plantsLoading } = useQuery({
    queryKey: ['admin', 'plants'],
    queryFn: () => api.getAdminPlants(),
  });

  const { data: areasData, isLoading: areasLoading } = useQuery({
    queryKey: ['admin', 'areas'],
    queryFn: () => api.getAdminAreas(),
  });

  const { data: equipmentData, isLoading: equipmentLoading } = useQuery({
    queryKey: ['admin', 'equipment'],
    queryFn: () => api.getAdminEquipment(),
  });

  const users = usersData?.users || [];
  const plants = plantsData?.plants || [];
  const areas = areasData?.areas || [];
  const equipment = equipmentData?.equipment || [];

  const handleMutationSuccess = (message?: string) => {
    queryClient.invalidateQueries({ queryKey: ['admin'] });
    queryClient.invalidateQueries({ queryKey: ['plants'] });
    queryClient.invalidateQueries({ queryKey: ['areas'] });
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    setFlashMessage(message || 'Changes saved successfully.');
  };

  const tabs: Array<{ id: AdminTab; label: string; count?: number; icon: React.ReactNode }> = [
    {
      id: 'users',
      label: 'Users',
      count: users.length,
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'plants',
      label: 'Plants',
      count: plants.length,
      icon: <Building2 className="w-4 h-4" />,
    },
    {
      id: 'areas',
      label: 'Areas',
      count: areas.length,
      icon: <MapPin className="w-4 h-4" />,
    },
    {
      id: 'equipment',
      label: 'Equipment',
      count: equipment.length,
      icon: <Wrench className="w-4 h-4" />,
    },
    {
      id: 'activity',
      label: 'Admin Activity',
      icon: <History className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Administration Console</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Manage system users, facilities, area ownership, tagged equipment, and administrative audit logs.
          </p>
        </div>
      </div>

      {flashMessage && (
        <div
          role="status"
          className="px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
            {flashMessage}
          </span>
          <button
            type="button"
            onClick={() => setFlashMessage(null)}
            className="text-[11px] font-semibold text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Responsive Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
            Active Users
          </span>
          <p className="text-lg font-bold text-[#172033] mt-0.5">
            {users.filter((u) => u.isActive).length}{' '}
            <span className="text-xs font-normal text-[#64748B]">/ {users.length}</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
            Active Plants
          </span>
          <p className="text-lg font-bold text-[#172033] mt-0.5">
            {plants.filter((p) => p.isActive).length}{' '}
            <span className="text-xs font-normal text-[#64748B]">/ {plants.length}</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
            Active Areas
          </span>
          <p className="text-lg font-bold text-[#172033] mt-0.5">
            {areas.filter((a) => a.isActive).length}{' '}
            <span className="text-xs font-normal text-[#64748B]">/ {areas.length}</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-3.5 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
            Active Equipment
          </span>
          <p className="text-lg font-bold text-[#172033] mt-0.5">
            {equipment.filter((e) => e.isActive).length}{' '}
            <span className="text-xs font-normal text-[#64748B]">/ {equipment.length}</span>
          </p>
        </div>
      </div>

      {/* Scrollable Tab Strip (390px safe) */}
      <div className="flex border-b border-slate-200 gap-4 sm:gap-6 text-sm font-semibold overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                isSelected
                  ? 'border-[#059669] text-[#059669]'
                  : 'border-transparent text-[#64748B] hover:text-[#172033]'
              }`}
            >
              {tab.icon}
              <span>
                {tab.label}
                {typeof tab.count === 'number' ? ` (${tab.count})` : ''}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && (
        <UsersTab
          users={users}
          areas={areas}
          currentUserId={currentUser?.id}
          isLoading={usersLoading}
          onSuccess={() => handleMutationSuccess('User registry updated.')}
        />
      )}

      {activeTab === 'plants' && (
        <PlantsTab
          plants={plants}
          isLoading={plantsLoading}
          onSuccess={() => handleMutationSuccess('Plant registry updated.')}
        />
      )}

      {activeTab === 'areas' && (
        <AreasTab
          areas={areas}
          plants={plants}
          users={users}
          isLoading={areasLoading}
          onSuccess={() => handleMutationSuccess('Area configuration updated.')}
        />
      )}

      {activeTab === 'equipment' && (
        <EquipmentTab
          equipment={equipment}
          areas={areas}
          isLoading={equipmentLoading}
          onSuccess={() => handleMutationSuccess('Equipment registry updated.')}
        />
      )}

      {activeTab === 'activity' && <ActivityTab />}
    </div>
  );
};
