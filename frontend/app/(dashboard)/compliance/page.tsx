'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';

interface DocItem {
  status: string;
  expiry: string;
  daysLeft: number | null;
  provider?: string;
}

interface ComplianceRecord {
  vehicleId: string;
  rc: DocItem;
  insurance: DocItem;
  fitness: DocItem;
  pollution: DocItem;
  statePermit: DocItem;
  nationalPermit: DocItem;
}

interface Driver {
  id: string;
  name: string;
  dlNumber: string;
  licenseExpiry: string;
  licenseDaysLeft?: number;
  licenseStatus?: string;
}

const STATUS_STYLES: Record<string, string> = {
  Valid:           'bg-green-100 text-green-700',
  'Due Soon':      'bg-yellow-100 text-yellow-700',
  'Expiring Soon': 'bg-orange-100 text-orange-700',
  Expired:         'bg-red-100 text-red-700',
  'Not Set':       'bg-slate-100 text-slate-400',
};

const INPUT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>{children}</div>;
}

function daysLeft(expiryStr: string) {
  return Math.ceil((new Date(expiryStr).getTime() - Date.now()) / 86400000);
}

function licenseStatus(days: number) {
  if (days < 0)   return 'Expired';
  if (days <= 30)  return 'Expiring Soon';
  if (days <= 90)  return 'Due Soon';
  return 'Valid';
}

function ComplianceCell({ item }: { item: DocItem }) {
  const days = item.daysLeft;
  return (
    <td className="px-4 py-3">
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[item.status] || 'bg-slate-100 text-slate-600'}`}>
        {item.status}
      </span>
      <div className="text-xs text-slate-400 mt-0.5">{item.expiry || '—'}</div>
      {days !== null && (
        <div className={`text-xs font-medium mt-0.5 ${days < 0 ? 'text-red-500' : days <= 30 ? 'text-orange-500' : days <= 90 ? 'text-yellow-600' : 'text-slate-400'}`}>
          {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
        </div>
      )}
    </td>
  );
}

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const EMPTY_COMPLIANCE_FORM = {
  rcExpiry: '', insuranceExpiry: '', insuranceProvider: '',
  fitnessExpiry: '', pollutionExpiry: '', statePermitExpiry: '', nationalPermitExpiry: '',
};

export default function CompliancePage() {
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange } = useDateRange();
  const [editVehicleId, setEditVehicleId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_COMPLIANCE_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    Promise.all([api.compliance(), api.drivers()])
      .then(([comp, drvs]) => { setRecords(comp); setDrivers(drvs); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function openEdit(r: ComplianceRecord) {
    setEditVehicleId(r.vehicleId);
    setEditForm({
      rcExpiry: r.rc.expiry,
      insuranceExpiry: r.insurance.expiry,
      insuranceProvider: r.insurance.provider || '',
      fitnessExpiry: r.fitness.expiry,
      pollutionExpiry: r.pollution.expiry,
      statePermitExpiry: r.statePermit.expiry,
      nationalPermitExpiry: r.nationalPermit.expiry,
    });
  }

  function setEditField(field: string, value: string) {
    setEditForm(f => ({ ...f, [field]: value }));
  }

  async function handleSaveCompliance(e: React.FormEvent) {
    e.preventDefault();
    if (!editVehicleId) return;
    setSaving(true);
    try {
      const updated: ComplianceRecord = await api.saveCompliance(editVehicleId, {
        rc: { expiry: editForm.rcExpiry },
        insurance: { expiry: editForm.insuranceExpiry, provider: editForm.insuranceProvider },
        fitness: { expiry: editForm.fitnessExpiry },
        pollution: { expiry: editForm.pollutionExpiry },
        statePermit: { expiry: editForm.statePermitExpiry },
        nationalPermit: { expiry: editForm.nationalPermitExpiry },
      });
      setRecords(prev => prev.map(r => r.vehicleId === updated.vehicleId ? updated : r));
      setEditVehicleId(null);
      setSuccessMsg(`Compliance details updated for ${updated.vehicleId}`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // Filter records to vehicles with any doc expiring within the selected period
  const filteredRecords = records.filter(r =>
    [r.rc, r.insurance, r.fitness, r.pollution, r.statePermit, r.nationalPermit].some(d => inRange(d.expiry))
  );
  const displayRecords = filteredRecords.length > 0 ? filteredRecords : records;

  const allDocs = records.flatMap(r => [r.rc, r.insurance, r.fitness, r.pollution, r.statePermit, r.nationalPermit]);
  const expired  = allDocs.filter(d => d.status === 'Expired').length;
  const expiring = allDocs.filter(d => d.status === 'Expiring Soon').length;
  const dueSoon  = allDocs.filter(d => d.status === 'Due Soon').length;
  const valid    = allDocs.filter(d => d.status === 'Valid').length;

  function handleExport() {
    const headers = ['Vehicle', 'RC Status', 'RC Expiry', 'RC Days Left', 'Insurance Status', 'Insurance Expiry', 'Insurance Days Left', 'Fitness Status', 'Fitness Expiry', 'Fitness Days Left', 'Pollution Status', 'Pollution Expiry', 'State Permit', 'State Expiry', 'National Permit', 'National Expiry'];
    const rows = displayRecords.map(r => [
      r.vehicleId,
      r.rc.status, r.rc.expiry, String(r.rc.daysLeft),
      r.insurance.status, r.insurance.expiry, String(r.insurance.daysLeft),
      r.fitness.status, r.fitness.expiry, String(r.fitness.daysLeft),
      r.pollution.status, r.pollution.expiry, String(r.pollution.daysLeft),
      r.statePermit.status, r.statePermit.expiry,
      r.nationalPermit.status, r.nationalPermit.expiry,
    ]);
    downloadCSV('tms_compliance_report.csv', rows, headers);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-5">
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {successMsg}
        </div>
      )}

      <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} count={filteredRecords.length} total={records.length} />

      {/* Alert banner */}
      {(expired > 0 || expiring > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-red-700">{expired} Expired · {expiring} Expiring within 30 days</div>
            <div className="text-xs text-red-500">Immediate action required to avoid fines</div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Valid',           value: valid,    color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Due in 90 days',  value: dueSoon,  color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Expiring (30d)',   value: expiring, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Expired',          value: expired,  color: 'text-red-600',    bg: 'bg-red-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 border border-slate-100`}>
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-slate-600 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Threshold legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Valid — 90+ days remaining</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> Due Soon — 31–90 days</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Expiring Soon — within 30 days</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Expired</span>
      </div>

      {/* Compliance Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-slate-800">Fleet Compliance Matrix</h3>
          <button onClick={handleExport}
            className="text-sm text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Vehicle', 'RC', 'Insurance', 'Fitness Cert.', 'Pollution Cert.', 'State Permit', 'National Permit', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayRecords.map(r => (
                <tr key={r.vehicleId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-sm font-medium text-slate-700">{r.vehicleId}</td>
                  <ComplianceCell item={r.rc} />
                  <ComplianceCell item={r.insurance} />
                  <ComplianceCell item={r.fitness} />
                  <ComplianceCell item={r.pollution} />
                  <ComplianceCell item={r.statePermit} />
                  <ComplianceCell item={r.nationalPermit} />
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(r)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Driver License Compliance — from real API data */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Driver License Compliance</h3>
        <div className="space-y-3">
          {drivers.map(d => {
            const days = daysLeft(d.licenseExpiry);
            const status = licenseStatus(days);
            return (
              <div key={d.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-slate-700">{d.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{d.dlNumber} · Exp: {d.licenseExpiry}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${days < 0 ? 'text-red-500' : days <= 30 ? 'text-orange-500' : days <= 90 ? 'text-yellow-600' : 'text-slate-400'}`}>
                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                  </span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>{status}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Compliance Modal */}
      {editVehicleId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Edit Compliance — {editVehicleId}</h3>
              <button onClick={() => setEditVehicleId(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveCompliance} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="RC Expiry">
                  <input type="date" value={editForm.rcExpiry} onChange={e => setEditField('rcExpiry', e.target.value)} className={INPUT} />
                </Field>
                <Field label="Fitness Cert. Expiry">
                  <input type="date" value={editForm.fitnessExpiry} onChange={e => setEditField('fitnessExpiry', e.target.value)} className={INPUT} />
                </Field>
                <Field label="Insurance Expiry">
                  <input type="date" value={editForm.insuranceExpiry} onChange={e => setEditField('insuranceExpiry', e.target.value)} className={INPUT} />
                </Field>
                <Field label="Insurance Provider">
                  <input value={editForm.insuranceProvider} onChange={e => setEditField('insuranceProvider', e.target.value)} placeholder="e.g. HDFC ERGO" className={INPUT} />
                </Field>
                <Field label="Pollution Cert. Expiry">
                  <input type="date" value={editForm.pollutionExpiry} onChange={e => setEditField('pollutionExpiry', e.target.value)} className={INPUT} />
                </Field>
                <Field label="State Permit Expiry">
                  <input type="date" value={editForm.statePermitExpiry} onChange={e => setEditField('statePermitExpiry', e.target.value)} className={INPUT} />
                </Field>
                <Field label="National Permit Expiry">
                  <input type="date" value={editForm.nationalPermitExpiry} onChange={e => setEditField('nationalPermitExpiry', e.target.value)} className={INPUT} />
                </Field>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setEditVehicleId(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Saving...' : 'Save Compliance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
