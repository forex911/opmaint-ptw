import React, { useState } from 'react';
import { Plus, Edit2, KeyRound, Power, Eye, EyeOff, RefreshCw, Search } from 'lucide-react';
import { UserRole, ADMIN_PASSWORD_MIN_LENGTH } from '@ptw/shared';
import type { Area, User } from '../../types/index.js';
import { api } from '../../api/client.js';
import { Button } from '../ui/Button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card.js';
import { Input } from '../ui/Input.js';
import { Modal } from '../ui/Modal.js';
import { Skeleton } from '../ui/Skeleton.js';
import {
  ActiveStatusBadge,
  AdminErrorAlert,
  generateSecurePassword,
  parseAdminApiError,
  RoleBadge,
  type ParsedAdminError,
} from './admin-utils.js';

interface UsersTabProps {
  users: User[];
  areas: Area[];
  currentUserId?: string;
  isLoading: boolean;
  onSuccess: () => void;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  users,
  areas,
  currentUserId,
  isLoading,
  onSuccess,
}) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showInactive, setShowInactive] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [toggleTarget, setToggleTarget] = useState<User | null>(null);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>(UserRole.REQUESTER);
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formAreaIds, setFormAreaIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<ParsedAdminError | null>(null);

  const activeAreas = areas.filter((a) => a.isActive);

  const filteredUsers = users.filter((u) => {
    if (!showInactive && !u.isActive) return false;
    if (roleFilter && u.role !== roleFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  const openCreateModal = () => {
    setFormName('');
    setFormEmail('');
    setFormRole(UserRole.REQUESTER);
    setFormPassword('');
    setShowPassword(false);
    setFormAreaIds([]);
    setModalError(null);
    setCreateOpen(true);
  };

  const openEditModal = (u: User) => {
    setFormName(u.name);
    setFormRole(u.role);
    setFormAreaIds(u.ownedAreas ? u.ownedAreas.map((a) => a.id) : []);
    setModalError(null);
    setEditTarget(u);
  };

  const openResetModal = (u: User) => {
    setFormPassword('');
    setShowPassword(false);
    setModalError(null);
    setResetTarget(u);
  };

  const openToggleModal = (u: User) => {
    setModalError(null);
    setToggleTarget(u);
  };

  const toggleAreaSelection = (areaId: string) => {
    setFormAreaIds((prev) =>
      prev.includes(areaId) ? prev.filter((id) => id !== areaId) : [...prev, areaId]
    );
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSaving(true);
    try {
      await api.createAdminUser({
        name: formName,
        email: formEmail,
        password: formPassword,
        role: formRole,
        areaIds: formRole === UserRole.AREA_OWNER ? formAreaIds : [],
      });
      setCreateOpen(false);
      onSuccess();
    } catch (err) {
      setModalError(parseAdminApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setModalError(null);
    setIsSaving(true);
    try {
      await api.updateAdminUser(editTarget.id, {
        name: formName,
        role: formRole,
        ...(formRole === UserRole.AREA_OWNER ? { areaIds: formAreaIds } : {}),
      });
      setEditTarget(null);
      onSuccess();
    } catch (err) {
      setModalError(parseAdminApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setModalError(null);
    setIsSaving(true);
    try {
      await api.resetAdminUserPassword(resetTarget.id, { password: formPassword });
      setResetTarget(null);
      onSuccess();
    } catch (err) {
      setModalError(parseAdminApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setModalError(null);
    setIsSaving(true);
    try {
      await api.updateAdminUser(toggleTarget.id, { isActive: !toggleTarget.isActive });
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
          <CardTitle>Users & Role Assignments</CardTitle>
          <p className="text-xs text-[#64748B] mt-0.5">
            Create accounts, update roles, assign Area Owners, reset passwords, or deactivate access.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreateModal} className="self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          <span>Add User</span>
        </Button>
      </CardHeader>

      <div className="px-4 sm:px-6 py-3 bg-slate-50/70 border-b border-[#E2E8F0] flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2.5 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#059669]/20"
            />
          </div>
          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white text-[#172033]"
          >
            <option value="">All Roles</option>
            {Object.values(UserRole).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-[#64748B] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-300 text-[#059669] focus:ring-[#059669]"
          />
          <span>Show deactivated users</span>
        </label>
      </div>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            No users match the current filter.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B] uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">User</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">Owned Areas</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === currentUserId;
                    return (
                      <tr
                        key={u.id}
                        className={u.isActive ? 'hover:bg-slate-50/70' : 'bg-slate-100/70 opacity-65'}
                      >
                        <td className="px-6 py-3.5 font-semibold text-[#172033]">
                          {u.name}
                          {isSelf && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono">
                              You
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 font-mono text-[#64748B]">{u.email}</td>
                        <td className="px-6 py-3.5">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="px-6 py-3.5">
                          {u.ownedAreas && u.ownedAreas.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {u.ownedAreas.map((a) => (
                                <span
                                  key={a.id}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-700"
                                >
                                  {a.code}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          <ActiveStatusBadge isActive={u.isActive} />
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditModal(u)}
                              title="Edit user"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openResetModal(u)}
                              title="Reset password"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>Reset</span>
                            </Button>
                            <Button
                              variant={u.isActive ? 'outline' : 'secondary'}
                              size="sm"
                              disabled={isSelf && u.isActive}
                              onClick={() => openToggleModal(u)}
                              title={
                                isSelf && u.isActive
                                  ? 'Cannot deactivate your own account'
                                  : u.isActive
                                    ? 'Deactivate user'
                                    : 'Reactivate user'
                              }
                            >
                              <Power className="w-3.5 h-3.5" />
                              <span>{u.isActive ? 'Deactivate' : 'Reactivate'}</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (390px friendly) */}
            <div className="md:hidden divide-y divide-slate-200">
              {filteredUsers.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <div
                    key={u.id}
                    className={`p-4 space-y-3 ${u.isActive ? 'bg-white' : 'bg-slate-100/75 opacity-70'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#172033] truncate">
                          {u.name} {isSelf && <span className="text-[10px] font-mono text-slate-500">(You)</span>}
                        </p>
                        <p className="text-xs font-mono text-[#64748B] truncate">{u.email}</p>
                      </div>
                      <ActiveStatusBadge isActive={u.isActive} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <RoleBadge role={u.role} />
                      {u.ownedAreas?.map((a) => (
                        <span
                          key={a.id}
                          className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-700"
                        >
                          {a.code}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => openEditModal(u)}>
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openResetModal(u)}>
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Reset Password</span>
                      </Button>
                      <Button
                        variant={u.isActive ? 'outline' : 'secondary'}
                        size="sm"
                        disabled={isSelf && u.isActive}
                        onClick={() => openToggleModal(u)}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{u.isActive ? 'Deactivate' : 'Reactivate'}</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>

      {/* Create User Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add User Account"
        description="Provision a user with role-based permissions and initial password."
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <AdminErrorAlert error={modalError} />

          <Input
            label="Full Name"
            required
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Priya Sharma"
          />

          <Input
            label="Work Email"
            type="email"
            required
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            placeholder="e.g. priya.sharma@cmms.local"
          />

          <div>
            <label
              htmlFor="create-user-role"
              className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider"
            >
              Role <span className="text-red-500">*</span>
            </label>
            <select
              id="create-user-role"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white text-[#172033]"
            >
              {Object.values(UserRole).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="create-user-password"
                className="block text-xs font-semibold text-[#172033] uppercase tracking-wider"
              >
                Initial Password <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setFormPassword(generateSecurePassword());
                  setShowPassword(true);
                }}
                className="text-[11px] font-semibold text-[#059669] hover:text-[#047857] inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Generate Strong</span>
              </button>
            </div>
            <div className="relative">
              <input
                id="create-user-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={ADMIN_PASSWORD_MIN_LENGTH}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={`Minimum ${ADMIN_PASSWORD_MIN_LENGTH} characters`}
                className="w-full px-3.5 py-2 pr-10 text-sm border border-[#E2E8F0] rounded-lg"
              />
              <button
                type="button"
                aria-label="Toggle password visibility"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {formRole === UserRole.AREA_OWNER && (
            <div>
              <span className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
                Assign Areas (Optional)
              </span>
              <div className="max-h-36 overflow-y-auto border border-[#E2E8F0] rounded-lg p-2.5 space-y-1.5 bg-slate-50/50">
                {activeAreas.length === 0 ? (
                  <p className="text-xs text-[#64748B]">No active areas available.</p>
                ) : (
                  activeAreas.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-xs text-[#172033] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formAreaIds.includes(a.id)}
                        onChange={() => toggleAreaSelection(a.id)}
                        className="rounded border-slate-300 text-[#059669]"
                      />
                      <span className="font-mono font-semibold">{a.code}</span>
                      <span className="truncate">{a.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              Create User
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit User: ${editTarget?.name || ''}`}
        description={editTarget?.email}
      >
        <form onSubmit={handleUpdateUser} className="space-y-4">
          <AdminErrorAlert error={modalError} />

          <Input
            label="Full Name"
            required
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />

          <div>
            <label
              htmlFor="edit-user-role"
              className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider"
            >
              Role
            </label>
            <select
              id="edit-user-role"
              value={formRole}
              disabled={editTarget?.id === currentUserId}
              onChange={(e) => setFormRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-500"
            >
              {Object.values(UserRole).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {editTarget?.id === currentUserId && (
              <p className="text-[11px] text-[#64748B] mt-1">
                Administrators cannot demote their own active role.
              </p>
            )}
          </div>

          {formRole === UserRole.AREA_OWNER && (
            <div>
              <span className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
                Owned Areas
              </span>
              <div className="max-h-36 overflow-y-auto border border-[#E2E8F0] rounded-lg p-2.5 space-y-1.5 bg-slate-50/50">
                {activeAreas.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-xs text-[#172033] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formAreaIds.includes(a.id)}
                      onChange={() => toggleAreaSelection(a.id)}
                      className="rounded border-slate-300 text-[#059669]"
                    />
                    <span className="font-mono font-semibold">{a.code}</span>
                    <span className="truncate">{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title={`Reset Password: ${resetTarget?.name || ''}`}
        description="Minimum 12 characters. Password hashes are never recorded in audit logs."
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <AdminErrorAlert error={modalError} />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="reset-user-password"
                className="block text-xs font-semibold text-[#172033] uppercase tracking-wider"
              >
                New Password <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setFormPassword(generateSecurePassword());
                  setShowPassword(true);
                }}
                className="text-[11px] font-semibold text-[#059669] hover:text-[#047857] inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Generate Strong</span>
              </button>
            </div>
            <div className="relative">
              <input
                id="reset-user-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={ADMIN_PASSWORD_MIN_LENGTH}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={`Minimum ${ADMIN_PASSWORD_MIN_LENGTH} characters`}
                className="w-full px-3.5 py-2 pr-10 text-sm border border-[#E2E8F0] rounded-lg"
              />
              <button
                type="button"
                aria-label="Toggle password visibility"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              Update Password
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate / Reactivate Confirm Modal */}
      <Modal
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        title={
          toggleTarget?.isActive
            ? `Deactivate User: ${toggleTarget.name}`
            : `Reactivate User: ${toggleTarget?.name || ''}`
        }
      >
        <div className="space-y-4">
          <AdminErrorAlert error={modalError} />

          <p className="text-xs text-[#64748B] leading-relaxed">
            {toggleTarget?.isActive
              ? 'Deactivating this account blocks future logins and immediately invalidates any active session tokens (HTTP 401). Historical permits and audit logs remain intact.'
              : 'Reactivating this account restores login access with the user’s existing role and credentials.'}
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setToggleTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={toggleTarget?.isActive ? 'destructive' : 'primary'}
              isLoading={isSaving}
              onClick={handleToggleActive}
            >
              {toggleTarget?.isActive ? 'Deactivate Account' : 'Reactivate Account'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
