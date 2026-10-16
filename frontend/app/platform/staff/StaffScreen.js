'use client';

import { useState, useEffect, useCallback } from 'react';
import { platformFetch } from '../../../lib/platformApi';
import { usePlatformStaff } from '../../../lib/platformContext';
import { relativeTime, fmtDate } from '../../../lib/platformFmt';

const ROLE_CHIP = {
  owner:   'bg-[#FEF3C7] text-[#92400E]',
  admin:   'bg-[#E7E5FF] text-[#3730A3]',
  support: 'bg-[#EEF0F4] text-[#4A5060]',
};
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', support: 'Support' };

const CAPS = [
  { label: 'Sign in to this panel',         owner: true,  admin: true,  support: true  },
  { label: 'View all stores and stats',      owner: true,  admin: true,  support: true  },
  { label: 'View shopper list (masked)',     owner: true,  admin: true,  support: true  },
  { label: 'Reveal shopper contact',        owner: true,  admin: true,  support: false },
  { label: 'Download store report',         owner: true,  admin: true,  support: false },
  { label: 'Suspend or turn on a store',    owner: true,  admin: true,  support: false },
  { label: 'View audit log',                owner: true,  admin: true,  support: false },
  { label: 'Manage staff',                  owner: true,  admin: false, support: false },
];

function RoleChip({ role }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_CHIP[role] ?? ROLE_CHIP.support}`}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="animate-pulse h-12 rounded-xl border border-[#E1E4EA] bg-white" />
  );
}

export default function StaffScreen() {
  const me = usePlatformStaff();
  const [staffList,  setStaffList]  = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadError,   setLoadError]   = useState(null);

  // Add form
  const [addOpen,    setAddOpen]    = useState(false);
  const [addEmail,   setAddEmail]   = useState('');
  const [addName,    setAddName]    = useState('');
  const [addRole,    setAddRole]    = useState('support');
  const [addLoading, setAddLoading] = useState(false);
  const [addError,   setAddError]   = useState(null);

  // Per-row state
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editRole,      setEditRole]      = useState('');
  const [rowLoading,    setRowLoading]    = useState(null); // id currently mutating
  const [rowErrors,     setRowErrors]     = useState({});   // { [id]: string }

  const isOwner = me?.role === 'owner';

  const loadStaff = useCallback(async () => {
    setListLoading(true);
    setLoadError(null);
    try {
      const d = await platformFetch('/api/platform/staff');
      setStaffList(d.staff);
    } catch (e) {
      setLoadError(e.message || 'Failed to load staff.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    if (!isOwner) { setListLoading(false); return; }
    loadStaff();
  }, [me, isOwner, loadStaff]);

  async function handleAdd(e) {
    e.preventDefault();
    setAddLoading(true);
    setAddError(null);
    try {
      const created = await platformFetch('/api/platform/staff', {
        method: 'POST',
        body: JSON.stringify({ email: addEmail.trim(), name: addName.trim(), role: addRole }),
      });
      setStaffList(l => [...l, created]);
      setAddOpen(false);
      setAddEmail(''); setAddName(''); setAddRole('support');
    } catch (e) {
      setAddError(e.message || 'Failed to add staff member.');
    } finally {
      setAddLoading(false);
    }
  }

  function startEditRole(member) {
    setEditingRoleId(member.id);
    setEditRole(member.role);
    setRowErrors(err => { const n = { ...err }; delete n[member.id]; return n; });
  }

  async function saveRole(member) {
    if (editRole === member.role) { setEditingRoleId(null); return; }
    setRowLoading(member.id);
    try {
      await platformFetch(`/api/platform/staff/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: editRole }),
      });
      setStaffList(l => l.map(s => s.id === member.id ? { ...s, role: editRole } : s));
      setEditingRoleId(null);
    } catch (e) {
      setRowErrors(err => ({ ...err, [member.id]: e.message || 'Failed to change role.' }));
    } finally {
      setRowLoading(null);
    }
  }

  async function toggleActive(member) {
    setRowLoading(member.id);
    setRowErrors(err => { const n = { ...err }; delete n[member.id]; return n; });
    try {
      await platformFetch(`/api/platform/staff/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !member.active }),
      });
      setStaffList(l => l.map(s => s.id === member.id ? { ...s, active: !s.active } : s));
    } catch (e) {
      setRowErrors(err => ({ ...err, [member.id]: e.message || 'Failed to update status.' }));
    } finally {
      setRowLoading(null);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (!me || (isOwner && listLoading)) {
    return (
      <div>
        <div className="mb-6 flex items-start gap-4">
          <div className="flex-1 space-y-2">
            <div className="animate-pulse h-7 w-24 rounded bg-[#E1E4EA]" />
            <div className="animate-pulse h-4 w-64 rounded bg-[#E1E4EA]" />
          </div>
        </div>
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    );
  }

  // ── Not owner ─────────────────────────────────────────────────────────────

  if (!isOwner) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold text-[#171A22] mb-2">Staff</h1>
        <p className="text-sm text-[#5A6070]">Only the owner can manage staff.</p>
      </div>
    );
  }

  // ── Owner view ────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold text-[#171A22] mb-0.5">Staff</h1>
          <p className="text-sm text-[#5A6070]">People who can sign in to this platform panel.</p>
        </div>
        <button
          onClick={() => { setAddOpen(o => !o); setAddError(null); }}
          className="min-h-[44px] rounded-lg bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4338CA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] transition-colors"
        >
          {addOpen ? 'Cancel' : 'Add staff member'}
        </button>
      </div>

      {/* Add form */}
      {addOpen && (
        <form onSubmit={handleAdd}
          className="mb-6 rounded-xl border border-[#E1E4EA] bg-white p-5 space-y-4">
          <h2 className="text-sm font-extrabold text-[#171A22]">New staff member</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#171A22]">
                Google email <span className="text-[#B3261E]">*</span>
              </span>
              <input
                type="email"
                value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                required
                placeholder="person@example.com"
                className="rounded-lg border border-[#E1E4EA] px-3 py-2 text-sm text-[#171A22] placeholder:text-[#5A6070] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#171A22]">
                Name <span className="text-[#5A6070] font-normal">(optional)</span>
              </span>
              <input
                type="text"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="Full name"
                className="rounded-lg border border-[#E1E4EA] px-3 py-2 text-sm text-[#171A22] placeholder:text-[#5A6070] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#171A22]">Role</span>
              <select
                value={addRole}
                onChange={e => setAddRole(e.target.value)}
                className="rounded-lg border border-[#E1E4EA] bg-white px-3 py-2 text-sm text-[#171A22] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="support">Support</option>
              </select>
            </label>
          </div>
          {addError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#B3261E]">
              {addError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)}
              className="rounded-lg border border-[#E1E4EA] px-4 py-2 text-sm font-semibold text-[#5A6070] hover:bg-[#F3F4F7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
              Cancel
            </button>
            <button type="submit" disabled={addLoading}
              className="min-h-[44px] rounded-lg bg-[#4F46E5] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
              {addLoading ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {/* Staff table */}
      {loadError ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-[#B3261E]">
          {loadError}
          <button onClick={loadStaff} className="ml-2 underline font-semibold">Retry</button>
        </div>
      ) : staffList && (
        <div className="mb-6 rounded-xl border border-[#E1E4EA] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#E1E4EA] bg-[#F3F4F7]">
                  {['Person', 'Role', 'Status', 'Last sign-in', 'Actions'].map(h => (
                    <th key={h} scope="col"
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-[#5A6070]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E4EA]">
                {staffList.map(member => {
                  const isSelf     = member.email === me?.email;
                  const isEditing  = editingRoleId === member.id;
                  const isMutating = rowLoading === member.id;
                  return (
                    <tr key={member.id} className="transition-colors hover:bg-[#F3F4F7]">
                      {/* Person */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#171A22]">
                          {member.name || '—'}
                          {isSelf && (
                            <span className="ml-1.5 text-xs font-normal text-[#5A6070]">you</span>
                          )}
                        </div>
                        <div className="text-xs text-[#5A6070]">{member.email}</div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editRole}
                            onChange={e => setEditRole(e.target.value)}
                            className="rounded-lg border border-[#E1E4EA] bg-white px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
                          >
                            <option value="owner">Owner</option>
                            <option value="admin">Admin</option>
                            <option value="support">Support</option>
                          </select>
                        ) : (
                          <RoleChip role={member.role} />
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${member.active ? 'text-[#1F8A5B]' : 'text-[#5A6070]'}`}>
                          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${member.active ? 'bg-[#1F8A5B]' : 'bg-[#E1E4EA]'}`} />
                          {member.active ? 'Active' : 'Turned off'}
                        </span>
                      </td>

                      {/* Last sign-in */}
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-[#5A6070]"
                        title={member.lastLoginAt ? fmtDate(member.lastLoginAt) : ''}>
                        {member.lastLoginAt ? relativeTime(member.lastLoginAt) : 'Never'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        {isSelf ? (
                          <span className="text-xs text-[#5A6070]">Cannot be changed</span>
                        ) : isEditing ? (
                          <div className="flex gap-1.5">
                            <button onClick={() => saveRole(member)} disabled={isMutating}
                              className="rounded-lg bg-[#4F46E5] px-3 py-1 text-xs font-semibold text-white hover:bg-[#4338CA] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
                              {isMutating ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingRoleId(null)} disabled={isMutating}
                              className="rounded-lg border border-[#E1E4EA] px-3 py-1 text-xs font-semibold text-[#5A6070] hover:bg-[#F3F4F7] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            <button onClick={() => startEditRole(member)} disabled={isMutating}
                              className="rounded-lg border border-[#E1E4EA] px-3 py-1 text-xs font-semibold text-[#5A6070] hover:bg-[#F3F4F7] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]">
                              Change role
                            </button>
                            <button onClick={() => toggleActive(member)} disabled={isMutating}
                              className={`rounded-lg border px-3 py-1 text-xs font-semibold disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] transition-colors ${
                                member.active
                                  ? 'border-[#B3261E] text-[#B3261E] hover:bg-red-50'
                                  : 'border-[#1F8A5B] text-[#1F8A5B] hover:bg-green-50'
                              }`}>
                              {isMutating ? '…' : member.active ? 'Turn off' : 'Turn on'}
                            </button>
                          </div>
                        )}
                        {rowErrors[member.id] && (
                          <p className="mt-1 text-xs text-[#B3261E]">{rowErrors[member.id]}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Capability table */}
      <div className="mb-4 rounded-xl border border-[#E1E4EA] bg-white overflow-hidden">
        <div className="border-b border-[#E1E4EA] px-5 py-3">
          <h2 className="text-sm font-extrabold text-[#171A22]">What each role can do</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#E1E4EA] bg-[#F3F4F7]">
                <th scope="col"
                  className="px-5 py-2.5 text-left text-xs font-semibold text-[#5A6070] w-full">
                  Capability
                </th>
                {['Owner', 'Admin', 'Support'].map(r => (
                  <th key={r} scope="col"
                    className="whitespace-nowrap px-5 py-2.5 text-center text-xs font-semibold text-[#5A6070]">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E4EA]">
              {CAPS.map(cap => (
                <tr key={cap.label} className="hover:bg-[#F3F4F7]">
                  <td className="px-5 py-2.5 text-[#171A22]">{cap.label}</td>
                  {['owner', 'admin', 'support'].map(r => (
                    <td key={r} className="px-5 py-2.5 text-center">
                      {cap[r]
                        ? <span className="font-bold text-[#1F8A5B]" aria-label="Yes">✓</span>
                        : <span className="text-[#5A6070]" aria-label="No">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-[#5A6070]">
        Nobody, in any role, can send or approve messages on behalf of a merchant —
        only the merchant can do that from inside their own Shopify app.
      </p>
    </div>
  );
}
