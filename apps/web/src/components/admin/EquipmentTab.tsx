import React, { useState } from 'react';
import { Plus, Edit2, Power, Search } from 'lucide-react';
import type { Area, Equipment } from '../../types/index.js';
import { api } from '../../api/client.js';
import { Button } from '../ui/Button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card.js';
import { Input } from '../ui/Input.js';
import { Modal } from '../ui/Modal.js';
import { Skeleton } from '../ui/Skeleton.js';
import {
  ActiveStatusBadge,
  AdminErrorAlert,
  parseAdminApiError,
  type ParsedAdminError,
} from './admin-utils.js';

interface EquipmentTabProps {
  equipment: Equipment[];
  areas: Area[];
  isLoading: boolean;
  onSuccess: () => void;
}

export const EquipmentTab: React.FC<EquipmentTabProps> = ({
  equipment,
  areas,
  isLoading,
  onSuccess,
}) => {
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Equipment | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Equipment | null>(null);

  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<ParsedAdminError | null>(null);

  const activeAreas = areas.filter((a) => a.isActive);

  const filtered = equipment.filter((eq) => {
    if (areaFilter && eq.areaId !== areaFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        eq.tag.toLowerCase().includes(q) ||
        eq.name.toLowerCase().includes(q) ||
        (eq.areaName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openCreate = () => {
    setTag('');
    setName('');
    setAreaId(activeAreas[0]?.id || '');
    setModalError(null);
    setCreateOpen(true);
  };

  const openEdit = (eq: Equipment) => {
    setTag(eq.tag);
    setName(eq.name);
    setAreaId(eq.areaId);
    setModalError(null);
    setEditTarget(eq);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSaving(true);
    try {
      await api.createAdminEquipment({
        tag: tag.trim(),
        name: name.trim(),
        areaId,
      });
      setCreateOpen(false);
      onSuccess();
    } catch (err) {
      setModalError(parseAdminApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setModalError(null);
    setIsSaving(true);
    try {
      await api.updateAdminEquipment(editTarget.id, {
        tag: tag.trim(),
        name: name.trim(),
        areaId,
      });
      setEditTarget(null);
      onSuccess();
    } catch (err) {
      setModalError(parseAdminApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!toggleTarget) return;
    setModalError(null);
    setIsSaving(true);
    try {
      await api.updateAdminEquipment(toggleTarget.id, { isActive: !toggleTarget.isActive });
      setToggleTarget(null);
      onSuccess();
    } catch (err) {
      setModalError(parseAdminApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <CardTitle>Tagged Industrial Equipment</CardTitle>
          <p className="text-xs text-[#64748B] mt-0.5">
            Register asset tags bound to operational areas. Equipment with active or pending permits cannot be deactivated.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate} className="self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          <span>Add Equipment</span>
        </Button>
      </CardHeader>

      <div className="px-4 sm:px-6 py-3 bg-slate-50/70 border-b border-[#E2E8F0] flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search asset tag or equipment name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white"
          />
        </div>
        <select
          aria-label="Filter equipment by area"
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white text-[#172033]"
        >
          <option value="">All Areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.code}){!a.isActive ? ' [Inactive]' : ''}
            </option>
          ))}
        </select>
      </div>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">No equipment matches this filter.</div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B] uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Tag</th>
                    <th className="px-6 py-3">Equipment Name</th>
                    <th className="px-6 py-3">Area</th>
                    <th className="px-6 py-3">Plant</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((eq) => (
                    <tr
                      key={eq.id}
                      className={eq.isActive ? 'hover:bg-slate-50/70' : 'bg-slate-100/70 opacity-65'}
                    >
                      <td className="px-6 py-3.5 font-mono font-bold text-[#172033]">{eq.tag}</td>
                      <td className="px-6 py-3.5 font-semibold text-[#172033]">{eq.name}</td>
                      <td className="px-6 py-3.5 text-[#64748B]">
                        {eq.areaName || '—'} {eq.areaCode ? `(${eq.areaCode})` : ''}
                      </td>
                      <td className="px-6 py-3.5 text-[#64748B]">{eq.plantName || '—'}</td>
                      <td className="px-6 py-3.5">
                        <ActiveStatusBadge isActive={eq.isActive} />
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => openEdit(eq)}>
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </Button>
                          <Button
                            variant={eq.isActive ? 'outline' : 'secondary'}
                            size="sm"
                            onClick={() => {
                              setModalError(null);
                              setToggleTarget(eq);
                            }}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{eq.isActive ? 'Deactivate' : 'Reactivate'}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-200">
              {filtered.map((eq) => (
                <div
                  key={eq.id}
                  className={`p-4 space-y-2.5 ${eq.isActive ? 'bg-white' : 'bg-slate-100/75 opacity-70'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] font-mono font-bold text-[#059669]">{eq.tag}</span>
                      <p className="text-sm font-bold text-[#172033] truncate">{eq.name}</p>
                      <p className="text-xs text-[#64748B]">
                        {eq.areaName} ({eq.areaCode}) • {eq.plantName}
                      </p>
                    </div>
                    <ActiveStatusBadge isActive={eq.isActive} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(eq)}>
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </Button>
                    <Button
                      variant={eq.isActive ? 'outline' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        setModalError(null);
                        setToggleTarget(eq);
                      }}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{eq.isActive ? 'Deactivate' : 'Reactivate'}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add Tagged Equipment">
        <form onSubmit={handleCreate} className="space-y-4">
          <AdminErrorAlert error={modalError} />
          <Input label="Asset Tag" required value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. P-404A" />
          <Input label="Equipment Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. High-Pressure Feed Pump A" />
          <div>
            <label htmlFor="create-eq-area" className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
              Area <span className="text-red-500">*</span>
            </label>
            <select
              id="create-eq-area"
              required
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="">Select active area...</option>
              {activeAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.code}) — {a.plantName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>Create Equipment</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit Equipment: ${editTarget?.tag || ''}`}>
        <form onSubmit={handleUpdate} className="space-y-4">
          <AdminErrorAlert error={modalError} />
          <Input label="Asset Tag" required value={tag} onChange={(e) => setTag(e.target.value)} />
          <Input label="Equipment Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <label htmlFor="edit-eq-area" className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
              Area
            </label>
            <select
              id="edit-eq-area"
              required
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.code}){!a.isActive ? ' [Inactive]' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        title={toggleTarget?.isActive ? `Deactivate Equipment: ${toggleTarget.tag}` : `Reactivate Equipment: ${toggleTarget?.tag || ''}`}
      >
        <div className="space-y-4">
          <AdminErrorAlert error={modalError} />
          <p className="text-xs text-[#64748B] leading-relaxed">
            {toggleTarget?.isActive
              ? 'Deactivating removes this equipment from new permit creation while keeping historical permits readable.'
              : 'Reactivating makes this asset selectable again for new permit requests.'}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setToggleTarget(null)}>Cancel</Button>
            <Button
              type="button"
              variant={toggleTarget?.isActive ? 'destructive' : 'primary'}
              isLoading={isSaving}
              onClick={handleToggle}
            >
              {toggleTarget?.isActive ? 'Deactivate Equipment' : 'Reactivate Equipment'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
