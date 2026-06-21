'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Alert {
  id: string; type: string; severity: string; vehicleId: string;
  message: string; timestamp: string; read: boolean; resolved?: boolean;
}

const SEVERITY_BADGE: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Low: 'bg-blue-100 text-blue-700',
};

const TYPE_ICONS: Record<string, string> = {
  'Speed Violation': 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  'Fitness Expired': 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  'Breakdown': 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  default: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
};

const BORDER_COLORS: Record<string, string> = {
  Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#3b82f6',
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [toast, setToast] = useState('');

  useEffect(() => {
    api.alerts().then(setAlerts).catch(console.error).finally(() => setLoading(false));
  }, []);

  const severities = ['All', 'Critical', 'High', 'Medium', 'Low'];
  const filtered = filter === 'All' ? alerts : alerts.filter(a => a.severity === filter);
  const unread = alerts.filter(a => !a.read).length;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function resolve(id: string) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true, read: true } : a));
    showToast('Alert marked as resolved.');
  }

  function dismiss(id: string) {
    setAlerts(prev => prev.filter(a => a.id !== id));
    showToast('Alert dismissed.');
  }

  function formatTime(ts: string) {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-5">
      {toast && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Alert Center</h2>
          {unread > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unread} Unread</span>
          )}
        </div>
        <div className="flex gap-2">
          {severities.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === s ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Critical', count: alerts.filter(a => a.severity === 'Critical').length, color: 'text-red-600 bg-red-50 border-red-100' },
          { label: 'High', count: alerts.filter(a => a.severity === 'High').length, color: 'text-orange-600 bg-orange-50 border-orange-100' },
          { label: 'Medium', count: alerts.filter(a => a.severity === 'Medium').length, color: 'text-yellow-600 bg-yellow-50 border-yellow-100' },
          { label: 'Low', count: alerts.filter(a => a.severity === 'Low').length, color: 'text-blue-600 bg-blue-50 border-blue-100' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl p-4 border ${c.color}`}>
            <div className="text-2xl font-bold">{c.count}</div>
            <div className="text-xs font-medium mt-0.5">{c.label} Alerts</div>
          </div>
        ))}
      </div>

      {/* Alert List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-100 p-8 text-center text-sm text-slate-400">No alerts in this category.</div>
        )}
        {filtered.map(a => (
          <div key={a.id}
            className={`bg-white rounded-xl border border-l-4 p-4 transition-all ${a.resolved ? 'opacity-50' : !a.read ? 'shadow-sm' : ''}`}
            style={{ borderLeftColor: BORDER_COLORS[a.severity] || '#94a3b8' }}>
            <div className="flex items-start gap-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${SEVERITY_BADGE[a.severity]}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TYPE_ICONS[a.type] || TYPE_ICONS.default} />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-800">{a.type}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_BADGE[a.severity]}`}>{a.severity}</span>
                  <span className="text-xs font-mono text-slate-400">{a.vehicleId}</span>
                  {!a.read && !a.resolved && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                  {a.resolved && <span className="text-xs text-green-600 font-medium">✓ Resolved</span>}
                </div>
                <p className="text-sm text-slate-600">{a.message}</p>
                <div className="text-xs text-slate-400 mt-1">{formatTime(a.timestamp)}</div>
              </div>
              {!a.resolved && (
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => resolve(a.id)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50">
                    Resolve
                  </button>
                  <button onClick={() => dismiss(a.id)}
                    className="text-xs text-slate-400 hover:text-red-500 font-medium px-2 py-1 rounded hover:bg-red-50">
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Notification Config */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Notification Channels</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { channel: 'Push Notifications', desc: 'In-app and mobile push', enabled: true },
            { channel: 'SMS Alerts', desc: 'SMS to registered mobile', enabled: true },
            { channel: 'Email Notifications', desc: 'Email to admin and managers', enabled: true },
            { channel: 'WhatsApp', desc: 'WhatsApp Business API', enabled: false },
          ].map(c => (
            <div key={c.channel} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-slate-700">{c.channel}</div>
                <div className="text-xs text-slate-500">{c.desc}</div>
              </div>
              <div className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors ${c.enabled ? 'bg-blue-600' : 'bg-slate-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${c.enabled ? 'translate-x-5' : ''}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
