'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface User {
  id: string; name: string; email: string; role: string;
  status: string; lastLogin: string; permissions: string[];
}

interface LoginEvent { id: string; userId: string; userName: string; role: string; email: string; timestamp: string; ip: string; }
interface ActivityData { loginHistory: LoginEvent[]; pageVisits: Record<string, Record<string, number>>; }

const ROLE_COLORS: Record<string, string> = {
  'Super Admin': 'bg-red-100 text-red-700',
  'Fleet Manager': 'bg-blue-100 text-blue-700',
  'Dispatcher': 'bg-violet-100 text-violet-700',
  'Accountant': 'bg-green-100 text-green-700',
  'Viewer': 'bg-slate-100 text-slate-600',
};

const ROLE_PERMISSIONS: Record<string, { module: string; access: boolean }[]> = {
  'Super Admin': [
    { module: 'Fleet', access: true }, { module: 'Drivers', access: true }, { module: 'Trips', access: true },
    { module: 'Fuel', access: true }, { module: 'Costing', access: true }, { module: 'Maintenance', access: true },
    { module: 'Compliance', access: true }, { module: 'Analytics', access: true }, { module: 'Users', access: true },
  ],
  'Fleet Manager': [
    { module: 'Fleet', access: true }, { module: 'Drivers', access: true }, { module: 'Trips', access: true },
    { module: 'Fuel', access: true }, { module: 'Costing', access: false }, { module: 'Maintenance', access: true },
    { module: 'Compliance', access: true }, { module: 'Analytics', access: true }, { module: 'Users', access: false },
  ],
  'Dispatcher': [
    { module: 'Fleet', access: true }, { module: 'Drivers', access: true }, { module: 'Trips', access: true },
    { module: 'Fuel', access: false }, { module: 'Costing', access: false }, { module: 'Maintenance', access: false },
    { module: 'Compliance', access: false }, { module: 'Analytics', access: false }, { module: 'Users', access: false },
  ],
  'Accountant': [
    { module: 'Fleet', access: false }, { module: 'Drivers', access: false }, { module: 'Trips', access: true },
    { module: 'Fuel', access: true }, { module: 'Costing', access: true }, { module: 'Maintenance', access: false },
    { module: 'Compliance', access: false }, { module: 'Analytics', access: true }, { module: 'Users', access: false },
  ],
  'Viewer': [
    { module: 'Fleet', access: true }, { module: 'Drivers', access: false }, { module: 'Trips', access: true },
    { module: 'Fuel', access: false }, { module: 'Costing', access: false }, { module: 'Maintenance', access: false },
    { module: 'Compliance', access: false }, { module: 'Analytics', access: true }, { module: 'Users', access: false },
  ],
};

const INPUT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const SELECT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>{children}</div>;
}

const EMPTY_INVITE = { name: '', email: '', role: 'Viewer' };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState('Super Admin');
  const [showInvite, setShowInvite] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);
  const [editForm, setEditForm] = useState({ name: '', role: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    Promise.all([api.users(), api.getActivity()])
      .then(([u, a]) => { setUsers(u as User[]); setActivity(a as ActivityData); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await new Promise(r => setTimeout(r, 500));
    const newUser: User = {
      id: 'U' + Date.now(),
      name: inviteForm.name,
      email: inviteForm.email,
      role: inviteForm.role,
      status: 'Active',
      lastLogin: new Date().toISOString(),
      permissions: [],
    };
    setUsers(prev => [...prev, newUser]);
    setInviteForm(EMPTY_INVITE);
    setShowInvite(false);
    setSaving(false);
    showToast(`Invitation sent to ${inviteForm.email}`);
  }

  function openEdit(u: User) {
    setEditUser(u);
    setEditForm({ name: u.name, role: u.role });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, name: editForm.name, role: editForm.role } : u));
    setEditUser(null);
    setSaving(false);
    showToast(`User ${editForm.name} updated.`);
  }

  function toggleDeactivate(id: string) {
    setUsers(prev => prev.map(u => {
      if (u.id !== id) return u;
      const next = u.status === 'Active' ? 'Inactive' : 'Active';
      showToast(`User ${u.name} set to ${next}.`);
      return { ...u, status: next };
    }));
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  const roles = [...new Set(users.map(u => u.role))];

  return (
    <div className="space-y-5">
      {toast && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {toast}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Users', value: users.length },
          { label: 'Active', value: users.filter(u => u.status === 'Active').length },
          { label: 'Inactive', value: users.filter(u => u.status === 'Inactive').length },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className="text-2xl font-bold text-slate-800">{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-slate-800">User Accounts</h3>
          <button onClick={() => setShowInvite(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Invite User
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              {['User', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map(u => (
              <tr key={u.id} className={`hover:bg-slate-50 ${u.status === 'Inactive' ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] || 'bg-slate-100 text-slate-600'}`}>{u.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{u.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatTime(u.lastLogin)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(u)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onClick={() => toggleDeactivate(u.id)}
                      className={`text-xs font-medium ${u.status === 'Active' ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}`}>
                      {u.status === 'Active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role Permissions Matrix */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Role Permissions Matrix</h3>
        <div className="flex gap-2 mb-4 flex-wrap">
          {roles.map(r => (
            <button key={r} onClick={() => setSelectedRole(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedRole === r ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {r}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(ROLE_PERMISSIONS[selectedRole] || []).map(p => (
            <div key={p.module} className={`flex items-center gap-2 p-2.5 rounded-lg ${p.access ? 'bg-green-50' : 'bg-slate-50'}`}>
              <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${p.access ? 'bg-green-500' : 'bg-slate-300'}`}>
                {p.access ? (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                )}
              </div>
              <span className={`text-xs font-medium ${p.access ? 'text-green-700' : 'text-slate-400'}`}>{p.module}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Activity Monitor */}
      {activity && (
        <>
          {/* Per-user login & page activity */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">User Activity — Page Visits</h3>
              <p className="text-xs text-slate-400 mt-0.5">Counts reset on server restart · tracks visits since last boot</p>
            </div>
            <div className="divide-y divide-slate-50">
              {users.map(u => {
                const visits = activity.pageVisits[u.id] || {};
                const total = Object.values(visits).reduce((s, n) => s + n, 0);
                const topPages = Object.entries(visits).sort((a, b) => b[1] - a[1]).slice(0, 4);
                const logins = activity.loginHistory.filter(l => l.userId === u.id);
                return (
                  <div key={u.id} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-[180px]">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{u.name.charAt(0)}</div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{u.name}</div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || 'bg-slate-100 text-slate-500'}`}>{u.role}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="text-center">
                        <div className="text-lg font-bold text-slate-800">{logins.length}</div>
                        <div className="text-xs text-slate-400">logins</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-slate-800">{total}</div>
                        <div className="text-xs text-slate-400">page visits</div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {topPages.length > 0 ? topPages.map(([page, count]) => (
                          <span key={page} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                            {page} <span className="font-semibold text-slate-800">{count}</span>
                          </span>
                        )) : (
                          <span className="text-xs text-slate-300 italic">No visits recorded yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent login history */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Recent Login History</h3>
              <span className="text-xs text-slate-400">{activity.loginHistory.length} events recorded</span>
            </div>
            {activity.loginHistory.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-8">No logins recorded since last server boot.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['User', 'Role', 'Time', 'IP Address'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {activity.loginHistory.slice(0, 30).map(ev => (
                      <tr key={ev.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <div className="text-sm font-medium text-slate-800">{ev.userName}</div>
                          <div className="text-xs text-slate-500">{ev.email}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[ev.role] || 'bg-slate-100 text-slate-600'}`}>{ev.role}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {formatTime(ev.timestamp)}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-500">{ev.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Invite User</h3>
              <button onClick={() => setShowInvite(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <Field label="Full Name *">
                <input required value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} placeholder="Priya Sharma" className={INPUT} />
              </Field>
              <Field label="Email Address *">
                <input required type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="priya@company.com" className={INPUT} />
              </Field>
              <Field label="Role *">
                <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))} className={SELECT}>
                  <option>Viewer</option>
                  <option>Dispatcher</option>
                  <option>Fleet Manager</option>
                  <option>Accountant</option>
                  <option>Super Admin</option>
                </select>
              </Field>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowInvite(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Edit User</h3>
              <button onClick={() => setEditUser(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <Field label="Full Name *">
                <input required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className={INPUT} />
              </Field>
              <div className="text-xs text-slate-400">Email: {editUser.email}</div>
              <Field label="Role *">
                <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className={SELECT}>
                  <option>Viewer</option>
                  <option>Dispatcher</option>
                  <option>Fleet Manager</option>
                  <option>Accountant</option>
                  <option>Super Admin</option>
                </select>
              </Field>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setEditUser(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
