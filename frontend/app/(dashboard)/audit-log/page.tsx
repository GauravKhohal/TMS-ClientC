'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AuditEntry {
  timestamp: string;
  userId: string;
  userName: string;
  role: string;
  action: string;
  details: Record<string, unknown>;
}

// Risk level and colour per action
const ACTION_META: Record<string, { label: string; category: string; risk: 'critical' | 'high' | 'medium' | 'low' }> = {
  'auth.login':                { label: 'Login',                category: 'Auth',     risk: 'low' },
  'trip.create':               { label: 'Trip Created',         category: 'Trips',    risk: 'medium' },
  'trip.edit':                 { label: 'Trip Edited',          category: 'Trips',    risk: 'high' },
  'trip.approve':              { label: 'Trip Approved',        category: 'Trips',    risk: 'medium' },
  'trip.reject':               { label: 'Trip Rejected',        category: 'Trips',    risk: 'medium' },
  'trip.driver_notification':  { label: 'Driver Notified',      category: 'Trips',    risk: 'low' },
  'pettycash.issue':           { label: 'Cash Issued',          category: 'Finance',  risk: 'critical' },
  'pettycash.reconcile':       { label: 'Cash Reconciled',      category: 'Finance',  risk: 'high' },
  'costing.toll.update':       { label: 'Toll Updated',         category: 'Finance',  risk: 'high' },
  'fleet.emi_payment':         { label: 'EMI Paid',             category: 'Finance',  risk: 'high' },
  'fasttag.transaction.link':  { label: 'FASTag Linked',        category: 'Finance',  risk: 'high' },
  'tyre.add':                  { label: 'Tyre Added',           category: 'Fleet',    risk: 'medium' },
  'tyre.update':               { label: 'Tyre Updated',         category: 'Fleet',    risk: 'medium' },
};

const RISK_STYLES = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  low:      'bg-slate-100 text-slate-600 border-slate-200',
};
const RISK_ROW = {
  critical: 'border-l-4 border-red-400 bg-red-50/40',
  high:     'border-l-4 border-orange-400',
  medium:   '',
  low:      '',
};

const CATEGORIES = ['All', 'Auth', 'Trips', 'Finance', 'Fleet'];

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function downloadCSV(entries: AuditEntry[]) {
  const rows = entries.map(e => [
    e.timestamp, e.userName, e.role, e.action, JSON.stringify(e.details),
  ]);
  const csv = [['Timestamp', 'User', 'Role', 'Action', 'Details'], ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [risk, setRisk] = useState('All');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    (api.getAuditLog() as Promise<AuditEntry[]>)
      .then(setEntries).catch(console.error).finally(() => setLoading(false));
  }, []);

  function toggleExpand(i: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  const filtered = entries.filter(e => {
    const meta = ACTION_META[e.action];
    const cat = meta?.category || 'Other';
    const r = meta?.risk || 'low';
    const s = search.toLowerCase();
    const matchSearch = !s ||
      e.userName.toLowerCase().includes(s) ||
      e.action.toLowerCase().includes(s) ||
      e.role.toLowerCase().includes(s) ||
      JSON.stringify(e.details).toLowerCase().includes(s);
    const matchCat  = category === 'All' || cat === category;
    const matchRisk = risk === 'All' || r === risk;
    return matchSearch && matchCat && matchRisk;
  });

  const counts = {
    total: entries.length,
    critical: entries.filter(e => ACTION_META[e.action]?.risk === 'critical').length,
    high: entries.filter(e => ACTION_META[e.action]?.risk === 'high').length,
    finance: entries.filter(e => ACTION_META[e.action]?.category === 'Finance').length,
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: counts.total, color: 'text-slate-800', bg: '' },
          { label: 'Critical Events', value: counts.critical, color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
          { label: 'High-Risk Events', value: counts.high, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100' },
          { label: 'Financial Actions', value: counts.finance, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-100' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl p-5 border shadow-sm ${c.bg || 'bg-white border-slate-100'}`}>
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-800 mr-2">Audit Trail</h3>

          {/* Category tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${category === c ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {c}
              </button>
            ))}
          </div>

          {/* Risk filter */}
          <select value={risk} onChange={e => setRisk(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="All">All Risk Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <input type="text" placeholder="Search user, action, trip ID, vehicle..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 ml-auto" />

          <button onClick={() => downloadCSV(filtered)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export CSV
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-12">No audit events match your filters.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map((e, i) => {
              const meta = ACTION_META[e.action];
              const riskLevel = meta?.risk || 'low';
              const isOpen = expanded.has(i);
              const hasFinancialChanges = Array.isArray((e.details as Record<string, unknown>).financialChanges);
              return (
                <div key={i} className={`px-4 py-3 hover:bg-slate-50 ${RISK_ROW[riskLevel]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Risk badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border flex-shrink-0 mt-0.5 ${RISK_STYLES[riskLevel]}`}>
                        {riskLevel.toUpperCase()}
                      </span>

                      <div className="min-w-0">
                        {/* Action label */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">
                            {meta?.label || e.action}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">{e.action}</span>
                          {hasFinancialChanges && (
                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Financial change</span>
                          )}
                        </div>

                        {/* Who + when */}
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs font-medium text-slate-700">{e.userName}</span>
                          <span className="text-xs text-slate-400">{e.role}</span>
                          <span className="text-xs text-slate-400">{fmtTime(e.timestamp)}</span>
                        </div>

                        {/* Key detail inline */}
                        <div className="mt-1 text-xs text-slate-500 font-mono">
                          {Object.entries(e.details)
                            .filter(([k]) => !['financialChanges'].includes(k))
                            .slice(0, 4)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' · ')}
                        </div>

                        {/* Financial changes (if any) */}
                        {isOpen && hasFinancialChanges && (
                          <div className="mt-2 space-y-1">
                            {(e.details.financialChanges as { field: string; before: unknown; after: unknown }[]).map(fc => (
                              <div key={fc.field} className="flex items-center gap-2 text-xs">
                                <span className="font-medium text-slate-600 w-28">{fc.field}</span>
                                <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-mono">₹{String(fc.before)}</span>
                                <span className="text-slate-400">→</span>
                                <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-mono">₹{String(fc.after)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Full details JSON (expanded) */}
                        {isOpen && (
                          <pre className="mt-2 p-2 bg-slate-50 rounded text-xs text-slate-600 overflow-x-auto max-w-xl">
                            {JSON.stringify(e.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>

                    <button onClick={() => toggleExpand(i)}
                      className="text-xs text-blue-600 hover:text-blue-800 flex-shrink-0 mt-0.5">
                      {isOpen ? 'Less' : 'Details'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="p-3 border-t border-slate-50 text-xs text-slate-400 text-right">
          Showing {filtered.length} of {entries.length} events · Audit log persists across server restarts
        </div>
      </div>
    </div>
  );
}
