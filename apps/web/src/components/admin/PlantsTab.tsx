import React, { useState } from 'react';
import { Plus, Edit2, Power, Search } from 'lucide-react';
import type { Plant } from '../../types/index.js';
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

interface PlantsTabProps {
  plants: Plant[];
  isLoading: boolean;
  onSuccess: () => void;
}

export const PlantsTab: React.FC<PlantsTabProps> = ({ plants, isLoading, onSuccess }) => {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Plant | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Plant | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<ParsedAdminError | null>(null);

  const filtered = plants.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.address || '').toLowerCase().includes(q)
    );
  });

  const openCreate = () => {
    setCode('');
    setName('');
    setAddress('');
    setModalError(null);
    setCreateOpen(true);
  };

  const openEdit = (p: Plant) => {
    setCode(p.code);
    setName(p.name);
    setAddress(p.address || '');
    setModalError(null);
    setEditTarget(p);
  };

  const openToggle = (p: Plant) => {
    setModalError(null);
    setToggleTarget(p);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSaving(true);
    try {
      await api.createAdminPlant({
        code: code.trim(),
        name: name.trim(),
        address: address.trim() ? address.trim() : null,
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
      await api.updateAdminPlant(editTarget.id, {
        code: code.trim(),
        name: name.trim(),
        address: address.trim() ? address.trim() : null,
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
      await api.updateAdminPlant(toggleTarget.id, { isActive: !toggleTarget.isActive });
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
          <CardTitle>Industrial Plants</CardTitle>
          <p className="text-xs text-[#64748B] mt-0.5">
            Top-level facility registry. Plants with active areas or open permits cannot be deactivated.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate} className="self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          <span>Add Plant</span>
        </Button>
      </CardHeader>

      <div className="px-4 sm:px-6 py-3 bg-slate-50/70 border-b border-[#E2E8F0]">
        <div className="relative max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search plant code, name, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white"
          />
        </div>
      </div>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">No plants found.</div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B] uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Code</th>
                    <th className="px-6 py-3">Facility Name</th>
                    <th className="px-6 py-3">Address</th>
                    <th className="px-6 py-3">Areas</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className={p.isActive ? 'hover:bg-slate-50/70' : 'bg-slate-100/70 opacity-65'}
                    >
                      <td className="px-6 py-3.5 font-mono font-bold text-[#172033]">{p.code}</td>
                      <td className="px-6 py-3.5 font-semibold text-[#172033]">{p.name}</td>
                      <td className="px-6 py-3.5 text-[#64748B]">{p.address || '—'}</td>
                      <td className="px-6 py-3.5 font-mono text-slate-700">{p.areaCount ?? 0}</td>
                      <td className="px-6 py-3.5">
                        <ActiveStatusBadge isActive={p.isActive} />
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </Button>
                          <Button
                            variant={p.isActive ? 'outline' : 'secondary'}
                            size="sm"
                            onClick={() => openToggle(p)}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{p.isActive ? 'Deactivate' : 'Reactivate'}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-200">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className={`p-4 space-y-2.5 ${p.isActive ? 'bg-white' : 'bg-slate-100/75 opacity-70'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] font-mono font-bold text-[#059669]">{p.code}</span>
                      <p className="text-sm font-bold text-[#172033] truncate">{p.name}</p>
                      <p className="text-xs text-[#64748B]">{p.address || 'No address'}</p>
                    </div>
                    <ActiveStatusBadge isActive={p.isActive} />
                  </div>
                  <div className="text-xs text-[#64748B]">Areas: {p.areaCount ?? 0}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </Button>
                    <Button
                      variant={p.isActive ? 'outline' : 'secondary'}
                      size="sm"
                      onClick={() => openToggle(p)}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{p.isActive ? 'Deactivate' : 'Reactivate'}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add Industrial Plant">
        <form onSubmit={handleCreate} className="space-y-4">
          <AdminErrorAlert error={modalError} />
          <Input label="Plant Code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. PLANT-CHE-04" />
          <Input label="Facility Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. North Ammonia Terminal" />
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional site address" />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>Create Plant</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit Plant: ${editTarget?.code || ''}`}>
        <form onSubmit={handleUpdate} className="space-y-4">
          <AdminErrorAlert error={modalError} />
          <Input label="Plant Code" required value={code} onChange={(e) => setCode(e.target.value)} />
          <Input label="Facility Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        title={toggleTarget?.isActive ? `Deactivate Plant: ${toggleTarget.code}` : `Reactivate Plant: ${toggleTarget?.code || ''}`}
      >
        <div className="space-y-4">
          <AdminErrorAlert error={modalError} />
          <p className="text-xs text-[#64748B] leading-relaxed">
            {toggleTarget?.isActive
              ? 'Deactivating hides this plant from new permits while preserving existing permits. You must deactivate all child areas first.'
              : 'Reactivating makes this plant visible again for areas and permit creation.'}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setToggleTarget(null)}>Cancel</Button>
            <Button
              type="button"
              variant={toggleTarget?.isActive ? 'destructive' : 'primary'}
              isLoading={isSaving}
              onClick={handleToggle}
            >
              {toggleTarget?.isActive ? 'Deactivate Plant' : 'Reactivate Plant'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
