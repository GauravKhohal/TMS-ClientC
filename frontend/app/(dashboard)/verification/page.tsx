'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface VerificationResult {
  status: 'Not Verified' | 'Verified' | 'Mismatch' | 'Failed';
  lastChecked: string | null;
  refId: string | null;
  source: string;
  details: Record<string, unknown> | null;
}

interface Vehicle {
  id: string;
  regNumber: string;
  make: string;
  model: string;
  rcVerification: VerificationResult;
}

interface Driver {
  id: string;
  name: string;
  dlNumber: string;
  panNumber: string;
  dlVerification: VerificationResult;
  panVerification: VerificationResult;
}

interface LogEntry {
  id: string;
  type: 'RC' | 'DL' | 'PAN';
  entityId: string;
  entityName: string;
  status: string;
  refId: string;
  timestamp: string;
  checkedBy: string;
}

const STATUS_STYLES: Record<string, string> = {
  'Not Verified': 'bg-slate-100 text-slate-500',
  Verified: 'bg-green-100 text-green-700',
  Mismatch: 'bg-yellow-100 text-yellow-700',
  Failed: 'bg-red-100 text-red-700',
};

const TYPE_LABELS: Record<string, string> = {
  RC: 'Registration Certificate (RC)',
  DL: 'Driving License (DL)',
  PAN: 'PAN Card',
};

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function VerifyButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="text-xs font-medium text-blue-600 border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? 'Checking…' : label}
    </button>
  );
}

export default function VerificationPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [detail, setDetail] = useState<{ title: string; entity: string; result: VerificationResult } | null>(null);

  useEffect(() => {
    Promise.all([api.fleet(), api.drivers(), api.verificationLog()])
      .then(([v, d, l]) => { setVehicles(v); setDrivers(d); setLog(l); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function refreshLog() {
    api.verificationLog().then(setLog).catch(console.error);
  }

  async function verifyRC(vehicle: Vehicle) {
    const key = `RC-${vehicle.id}`;
    setBusyKey(key);
    try {
      const res = await api.verifyRC(vehicle.id);
      setVehicles(prev => prev.map(v => v.id === vehicle.id ? { ...v, rcVerification: res.rcVerification } : v));
      setToast(`RC check for ${vehicle.regNumber}: ${res.rcVerification.status}`);
      refreshLog();
    } catch {
      setToast('Verification failed. Please try again.');
    } finally {
      setBusyKey(null);
      setTimeout(() => setToast(''), 3000);
    }
  }

  async function verifyDL(driver: Driver) {
    const key = `DL-${driver.id}`;
    setBusyKey(key);
    try {
      const res = await api.verifyDL(driver.id);
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, dlVerification: res.dlVerification } : d));
      setToast(`DL check for ${driver.name}: ${res.dlVerification.status}`);
      refreshLog();
    } catch {
      setToast('Verification failed. Please try again.');
    } finally {
      setBusyKey(null);
      setTimeout(() => setToast(''), 3000);
    }
  }

  async function verifyPAN(driver: Driver) {
    const key = `PAN-${driver.id}`;
    setBusyKey(key);
    try {
      const res = await api.verifyPAN(driver.id);
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, panVerification: res.panVerification } : d));
      setToast(`PAN check for ${driver.name}: ${res.panVerification.status}`);
      refreshLog();
    } catch {
      setToast('Verification failed. Please try again.');
    } finally {
      setBusyKey(null);
      setTimeout(() => setToast(''), 3000);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  const allChecks = [
    ...vehicles.map(v => v.rcVerification),
    ...drivers.map(d => d.dlVerification),
    ...drivers.map(d => d.panVerification),
  ];
  const counts = {
    Verified: allChecks.filter(c => c?.status === 'Verified').length,
    Mismatch: allChecks.filter(c => c?.status === 'Mismatch').length,
    Failed: allChecks.filter(c => c?.status === 'Failed').length,
    'Not Verified': allChecks.filter(c => c?.status === 'Not Verified').length,
  };

  return (
    <div className="space-y-5">
      {toast && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm px-4 py-2.5 rounded-xl">{toast}</div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-slate-800">TP Verification — Parivahan (RC/DL) & PAN</h2>
        <p className="text-sm text-slate-500 mt-0.5">Run third-party verification checks against government databases and review results below.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Verified',     value: counts.Verified,        color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Mismatch',     value: counts.Mismatch,        color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Failed',       value: counts.Failed,          color: 'text-red-600',    bg: 'bg-red-50' },
          { label: 'Not Verified', value: counts['Not Verified'], color: 'text-slate-500',  bg: 'bg-slate-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 border border-slate-100`}>
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-slate-600 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Vehicle RC Verification */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Vehicle RC Verification</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Vehicle', 'Reg. Number', 'Status', 'Last Checked', 'Ref ID', 'Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {vehicles.map(v => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{v.id} <span className="text-slate-400 font-normal">· {v.make} {v.model}</span></td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-600">{v.regNumber}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => v.rcVerification.lastChecked && setDetail({ title: 'RC', entity: v.regNumber, result: v.rcVerification })}
                      className={v.rcVerification.lastChecked ? 'cursor-pointer' : 'cursor-default'}>
                      <StatusBadge status={v.rcVerification.status} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatTimestamp(v.rcVerification.lastChecked)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{v.rcVerification.refId || '—'}</td>
                  <td className="px-4 py-3">
                    <VerifyButton label={v.rcVerification.lastChecked ? 'Re-verify' : 'Verify'} busy={busyKey === `RC-${v.id}`} onClick={() => verifyRC(v)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Driver DL & PAN Verification */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Driver DL & PAN Verification</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Driver', 'DL Number', 'DL Status', 'DL Action', 'PAN Number', 'PAN Status', 'PAN Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {drivers.map(d => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{d.id} <span className="text-slate-400 font-normal">· {d.name}</span></td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-600">{d.dlNumber}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => d.dlVerification.lastChecked && setDetail({ title: 'DL', entity: d.name, result: d.dlVerification })}
                      className={d.dlVerification.lastChecked ? 'cursor-pointer' : 'cursor-default'}>
                      <StatusBadge status={d.dlVerification.status} />
                    </button>
                    <div className="text-xs text-slate-400 mt-0.5">{formatTimestamp(d.dlVerification.lastChecked)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <VerifyButton label={d.dlVerification.lastChecked ? 'Re-verify' : 'Verify'} busy={busyKey === `DL-${d.id}`} onClick={() => verifyDL(d)} />
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-600">{d.panNumber}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => d.panVerification.lastChecked && setDetail({ title: 'PAN', entity: d.name, result: d.panVerification })}
                      className={d.panVerification.lastChecked ? 'cursor-pointer' : 'cursor-default'}>
                      <StatusBadge status={d.panVerification.status} />
                    </button>
                    <div className="text-xs text-slate-400 mt-0.5">{formatTimestamp(d.panVerification.lastChecked)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <VerifyButton label={d.panVerification.lastChecked ? 'Re-verify' : 'Verify'} busy={busyKey === `PAN-${d.id}`} onClick={() => verifyPAN(d)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verification transaction log */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Verification Transaction Log</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Timestamp', 'Type', 'Entity', 'Status', 'Ref ID', 'Checked By'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {log.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">No verification checks have been run yet.</td></tr>
              ) : log.map(entry => (
                <tr key={entry.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-500">{formatTimestamp(entry.timestamp)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{entry.type}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{entry.entityId} · {entry.entityName}</td>
                  <td className="px-4 py-3"><StatusBadge status={entry.status} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{entry.refId}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{entry.checkedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">{TYPE_LABELS[detail.title]}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{detail.entity}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Status</span>
                <StatusBadge status={detail.result.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Source</span>
                <span className="text-xs font-medium text-slate-700">{detail.result.source}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Reference ID</span>
                <span className="text-xs font-mono text-slate-700">{detail.result.refId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Checked At</span>
                <span className="text-xs text-slate-700">{formatTimestamp(detail.result.lastChecked)}</span>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-1.5">
                {detail.result.details && 'error' in detail.result.details ? (
                  <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{String(detail.result.details.error)}</div>
                ) : detail.result.details && Object.entries(detail.result.details).filter(([k]) => k !== 'mismatchFields').map(([k, val]) => {
                  const mismatch = ((detail.result.details!.mismatchFields as string[] | undefined) || []).includes(k);
                  return (
                    <div key={k} className={`flex items-center justify-between text-sm rounded-lg px-2 py-1 ${mismatch ? 'bg-yellow-50 text-yellow-800' : ''}`}>
                      <span className="text-slate-500">{formatKey(k)}</span>
                      <span className={`font-medium ${mismatch ? 'text-yellow-800' : 'text-slate-700'}`}>{Array.isArray(val) ? val.join(', ') : String(val)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
