import React, { useState } from 'react';
import { Plus, Edit2, Power, Info, Search } from 'lucide-react';
import { UserRole } from '@ptw/shared';
import type { Area, Plant, User } from '../../types/index.js';
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

interface AreasTabProps {
  areas: Area[];
  plants: Plant[];
  users: User[];
  isLoading: boolean;
  onSuccess: () => void;
}

export const AreasTab: React.FC<AreasTabProps> = ({
  areas,
  plants,
  users,
  isLoading,
  onSuccess,
}) => {
  const [search, setSearch] = useState('');
  const [plantFilter, setPlantFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Area | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Area | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [plantId, setPlantId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<ParsedAdminError | null>(null);

  const activePlants = plants.filter((p) => p.isActive);
  const activeAreaOwners = users.filter((u) => u.role === UserRole.AREA_OWNER && u.isActive);

  const filtered = areas.filter((a) => {
    if (plantFilter && a.plantId !== plantFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.ownerName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openCreate = () => {
    setCode('');
    setName('');
    setPlantId(activePlants[0]?.id || '');
    setOwnerId(activeAreaOwners[0]?.id || '');
    setModalError(null);
    setCreateOpen(true);
  };

  const openEdit = (a: Area) => {
    setCode(a.code);
    setName(a.name);
    setPlantId(a.plantId);
    setOwnerId(a.ownerId);
    setModalError(null);
    setEditTarget(a);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSaving(true);
    try {
      await api.createAdminArea({
        code: code.trim(),
        name: name.trim(),
        plantId,
        ownerId,
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
      await api.updateAdminArea(editTarget.id, {
        code: code.trim(),
        name: name.trim(),
        plantId,
        ownerId,
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
      await api.updateAdminArea(toggleTarget.id, { isActive: !toggleTarget.isActive });
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
          <CardTitle>Operational Areas & Assigned Owners</CardTitle>
          <p className="text-xs text-[#64748B] mt-0.5">
            Assign Area Owners to physical zones. Reassigning an owner transfers pending open-permit approvals automatically.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate} className="self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          <span>Add Area</span>
        </Button>
      </CardHeader>

      <div className="px-4 sm:px-6 py-3 bg-slate-50/70 border-b border-[#E2E8F0] flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search area code, name, or owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white"
          />
        </div>
        <select
          aria-label="Filter areas by plant"
          value={plantFilter}
          onChange={(e) => setPlantFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white text-[#172033]"
        >
          <option value="">All Plants</option>
          {plants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code}){!p.isActive ? ' [Inactive]' : ''}
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
          <div className="p-8 text-center text-xs text-[#64748B]">No areas match this filter.</div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B] uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Code</th>
                    <th className="px-6 py-3">Area Name</th>
                    <th className="px-6 py-3">Plant</th>
                    <th className="px-6 py-3">Assigned Owner</th>
                    <th className="px-6 py-3">Equipment</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((a) => (
                    <tr
                      key={a.id}
                      className={a.isActive ? 'hover:bg-slate-50/70' : 'bg-slate-100/70 opacity-65'}
                    >
                      <td className="px-6 py-3.5 font-mono font-bold text-[#172033]">{a.code}</td>
                      <td className="px-6 py-3.5 font-semibold text-[#172033]">{a.name}</td>
                      <td className="px-6 py-3.5 text-[#64748B]">
                        {a.plantName || '—'} {a.plantCode ? `(${a.plantCode})` : ''}
                      </td>
                      <td className="px-6 py-3.5">
                        {a.ownerName ? (
                          <div>
                            <span className="font-semibold text-[#172033]">{a.ownerName}</span>
                            <span className="block text-[11px] font-mono text-[#64748B]">{a.ownerEmail}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-slate-700">{a.equipmentCount ?? 0}</td>
                      <td className="px-6 py-3.5">
                        <ActiveStatusBadge isActive={a.isActive} />
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => openEdit(a)}>
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit / Owner</span>
                          </Button>
                          <Button
                            variant={a.isActive ? 'outline' : 'secondary'}
                            size="sm"
                            onClick={() => {
                              setModalError(null);
                              setToggleTarget(a);
                            }}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{a.isActive ? 'Deactivate' : 'Reactivate'}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-200">
              {filtered.map((a) => (
                <div
                  key={a.id}
                  className={`p-4 space-y-2.5 ${a.isActive ? 'bg-white' : 'bg-slate-100/75 opacity-70'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] font-mono font-bold text-[#059669]">{a.code}</span>
                      <p className="text-sm font-bold text-[#172033] truncate">{a.name}</p>
                      <p className="text-xs text-[#64748B]">{a.plantName} ({a.plantCode})</p>
                    </div>
                    <ActiveStatusBadge isActive={a.isActive} />
                  </div>
                  <div className="text-xs text-[#172033]">
                    Owner: <strong>{a.ownerName || 'Unassigned'}</strong>{' '}
                    <span className="text-[#64748B]">({a.equipmentCount ?? 0} equip.)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(a)}>
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit / Reassign</span>
                    </Button>
                    <Button
                      variant={a.isActive ? 'outline' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        setModalError(null);
                        setToggleTarget(a);
                      }}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{a.isActive ? 'Deactivate' : 'Reactivate'}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      {/* Add Area Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add Operational Area">
        <form onSubmit={handleCreate} className="space-y-4">
          <AdminErrorAlert error={modalError} />
          <Input label="Area Code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. AREA-UTL-04" />
          <Input label="Area Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cryogenic Nitrogen Unit" />

          <div>
            <label htmlFor="create-area-plant" className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
              Plant <span className="text-red-500">*</span>
            </label>
            <select
              id="create-area-plant"
              required
              value={plantId}
              onChange={(e) => setPlantId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="">Select active plant...</option>
              {activePlants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="create-area-owner" className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
              Assigned Area Owner <span className="text-red-500">*</span>
            </label>
            <select
              id="create-area-owner"
              required
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="">Select active Area Owner...</option>
              {activeAreaOwners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>Create Area</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Area / Reassign Owner Modal */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit Area: ${editTarget?.code || ''}`}>
        <form onSubmit={handleUpdate} className="space-y-4">
          <AdminErrorAlert error={modalError} />
          <Input label="Area Code" required value={code} onChange={(e) => setCode(e.target.value)} />
          <Input label="Area Name" required value={name} onChange={(e) => setName(e.target.value)} />

          <div>
            <label htmlFor="edit-area-plant" className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
              Plant
            </label>
            <select
              id="edit-area-plant"
              required
              value={plantId}
              onChange={(e) => setPlantId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
            >
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code}){!p.isActive ? ' [Inactive]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-area-owner" className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
              Assigned Area Owner
            </label>
            <select
              id="edit-area-owner"
              required
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
            >
              {activeAreaOwners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          {editTarget && ownerId && ownerId !== editTarget.ownerId && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <p>
                Reassigning this area updates all <strong>PENDING</strong> Area Owner approvals on non-terminal permits in this area to the new owner (completed approvals remain unchanged).
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      {/* Toggle Area Active Modal */}
      <Modal
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        title={toggleTarget?.isActive ? `Deactivate Area: ${toggleTarget.code}` : `Reactivate Area: ${toggleTarget?.code || ''}`}
      >
        <div className="space-y-4">
          <AdminErrorAlert error={modalError} />
          <p className="text-xs text-[#64748B] leading-relaxed">
            {toggleTarget?.isActive
              ? 'Areas with open permits or active equipment cannot be deactivated. Deactivated areas remain visible in historical permits.'
              : 'Reactivating restores this area for new equipment and permit requests.'}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setToggleTarget(null)}>Cancel</Button>
            <Button
              type="button"
              variant={toggleTarget?.isActive ? 'destructive' : 'primary'}
              isLoading={isSaving}
              onClick={handleToggle}
            >
              {toggleTarget?.isActive ? 'Deactivate Area' : 'Reactivate Area'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
