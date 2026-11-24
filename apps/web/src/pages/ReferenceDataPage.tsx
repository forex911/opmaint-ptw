import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, MapPin, Wrench, ShieldAlert } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card.js';
import { Skeleton } from '../components/ui/Skeleton.js';

export const ReferenceDataPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'plants' | 'areas' | 'equipment'>('plants');
  const [selectedPlantId, setSelectedPlantId] = useState<string>('');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');

  const { data: plantsData, isLoading: plantsLoading } = useQuery({
    queryKey: ['plants'],
    queryFn: () => api.getPlants(),
  });

  const { data: areasData, isLoading: areasLoading } = useQuery({
    queryKey: ['areas', selectedPlantId],
    queryFn: () => api.getAreas(selectedPlantId || undefined),
  });

  const { data: equipmentData, isLoading: equipmentLoading } = useQuery({
    queryKey: ['equipment', selectedAreaId],
    queryFn: () => api.getEquipment(selectedAreaId || undefined),
  });

  if (!isAdmin) {
    return (
      <div className="p-12 text-center text-slate-500 max-w-md mx-auto">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-800">Administrator Access Required</h2>
        <p className="text-xs text-slate-500 mt-1">
          Reference data configuration is restricted to System Administrators.
        </p>
      </div>
    );
  }

  const plants = plantsData?.plants || [];
  const areas = areasData?.areas || [];
  const equipment = equipmentData?.equipment || [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-[#172033]">Plant & Equipment Hierarchy</h1>
        <p className="text-xs text-[#64748B] mt-0.5">
          Master reference data: industrial facilities, operational areas, and tag-numbered equipment.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('plants')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'plants'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Plants ({plants.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('areas')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'areas'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Areas ({areas.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('equipment')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'equipment'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>Equipment ({equipment.length})</span>
        </button>
      </div>

      {/* Plants Tab */}
      {activeTab === 'plants' && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Industrial Plants</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {plantsLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Code</th>
                    <th className="px-6 py-3">Facility Name</th>
                    <th className="px-6 py-3">Address</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plants.map((plant) => (
                    <tr key={plant.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-mono font-bold text-slate-900">{plant.code}</td>
                      <td className="px-6 py-3 font-semibold text-slate-800">{plant.name}</td>
                      <td className="px-6 py-3 text-slate-600">{plant.address || '—'}</td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Areas Tab */}
      {activeTab === 'areas' && (
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle>Operational Areas & Assigned Owners</CardTitle>
              <select
                value={selectedPlantId}
                onChange={(e) => setSelectedPlantId(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="">All Plants</option>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {areasLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Area Code</th>
                    <th className="px-6 py-3">Area Name</th>
                    <th className="px-6 py-3">Assigned Area Owner</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {areas.map((area) => (
                    <tr key={area.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-mono font-bold text-slate-900">{area.code}</td>
                      <td className="px-6 py-3 font-semibold text-slate-800">{area.name}</td>
                      <td className="px-6 py-3 text-slate-700">
                        {area.areaOwner ? (
                          <span>
                            <strong>{area.areaOwner.name}</strong> ({area.areaOwner.email})
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Equipment Tab */}
      {activeTab === 'equipment' && (
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle>Tagged Industrial Equipment</CardTitle>
              <select
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="">All Areas</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.code})
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {equipmentLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Tag Number</th>
                    <th className="px-6 py-3">Equipment Name</th>
                    <th className="px-6 py-3">Technical Description</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {equipment.map((eq) => (
                    <tr key={eq.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-mono font-bold text-slate-900 bg-slate-50/50">
                        {eq.tagNo}
                      </td>
                      <td className="px-6 py-3 font-semibold text-slate-800">{eq.name}</td>
                      <td className="px-6 py-3 text-slate-600">{eq.description || '—'}</td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          Operational
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
