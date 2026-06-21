'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';

interface MaintenanceRecord {
  id: string; vehicleId: string; type: string; description: string;
  date: string; status: string; cost: number; vendor: string;
  estimatedCompletion: string; parts: string[];
}

const TYPE_COLORS: Record<string, string> = {
  Breakdown: 'bg-red-100 text-red-700',
  Preventive: 'bg-blue-100 text-blue-700',
  Tyre: 'bg-orange-100 text-orange-700',
};

const STATUS_COLORS: Record<string, string> = {
  Completed: 'bg-green-100 text-green-700',
  'In Progress': 'bg-yellow-100 text-yellow-700',
  Pending: 'bg-slate-100 text-slate-600',
};

const INPUT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const SELECT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>{children}</div>;
}

const EMPTY_FORM = {
  vehicleId: '', type: 'Preventive', description: '',
  date: new Date().toISOString().split('T')[0],
  vendor: '', estimatedCompletion: '', parts: '', cost: '',
};

export default function MaintenancePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <MaintenancePageInner />
    </Suspense>
  );
}

function MaintenancePageInner() {
  const searchParams = useSearchParams();
  const searchParam = searchParams.get('search');

  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParam || '');
  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange } = useDateRange();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    api.maintenance().then(setRecords).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = records.filter(r =>
    inRange(r.date) && (
      r.id.toLowerCase().includes(search.toLowerCase()) ||
      r.vehicleId.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase()) ||
      r.vendor.toLowerCase().includes(search.toLowerCase())
    )
  );

  const totalCost = filtered.reduce((s, r) => s + r.cost, 0);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const newRecord: MaintenanceRecord = await api.addMaintenanceRecord({
        vehicleId: form.vehicleId,
        type: form.type,
        description: form.description,
        date: form.date,
        vendor: form.vendor,
        estimatedCompletion: form.estimatedCompletion,
        cost: parseFloat(form.cost) || 0,
        parts: form.parts ? form.parts.split(',').map(p => p.trim()).filter(Boolean) : [],
      });
      setRecords(prev => [newRecord, ...prev]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      setSuccessMsg(`Maintenance logged for ${newRecord.vehicleId} — ₹${newRecord.cost.toLocaleString('en-IN')}`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
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

      <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} count={filtered.length} total={records.length} />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Filtered Records', value: filtered.length },
          { label: 'In Progress', value: filtered.filter(r => r.status === 'In Progress').length },
          { label: 'Pending', value: filtered.filter(r => r.status === 'Pending').length },
          { label: 'Total Maintenance Cost', value: `₹${totalCost.toLocaleString('en-IN')}` },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className="text-2xl font-bold text-slate-800">{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Records List */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center gap-4 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-800">Maintenance Records</h3>
          <button onClick={() => setShowAdd(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Log Maintenance
          </button>
          <input
            type="text" placeholder="Search by vehicle, ID, description, vendor..."
            value={search} onChange={e => setSearch(e.target.value)}
            className={INPUT + ' max-w-xs ml-auto'}
          />
        </div>
        <div className="divide-y divide-slate-50">
          {filtered.map(r => (
            <div key={r.id} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium text-slate-700">{r.vehicleId}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[r.type] || 'bg-slate-100 text-slate-600'}`}>{r.type}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                  </div>
                  <p className="text-sm text-slate-700 font-medium">{r.description}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                    <span>Date: {r.date}</span>
                    <span>Vendor: {r.vendor}</span>
                    <span>Est. Completion: {r.estimatedCompletion}</span>
                  </div>
                  {r.parts.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {r.parts.map(p => (
                        <span key={p} className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded">{p}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-slate-800">₹{r.cost.toLocaleString('en-IN')}</div>
                  <div className="text-xs text-slate-400">{r.id}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Maintenance Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Log Maintenance</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Vehicle ID *">
                  <input required value={form.vehicleId} onChange={e => set('vehicleId', e.target.value)} placeholder="V001" className={INPUT} />
                </Field>
                <Field label="Type *">
                  <select required value={form.type} onChange={e => set('type', e.target.value)} className={SELECT}>
                    <option>Preventive</option>
                    <option>Breakdown</option>
                    <option>Tyre</option>
                    <option>Inspection</option>
                  </select>
                </Field>
                <Field label="Date *">
                  <input required type="date" value={form.date} onChange={e => set('date', e.target.value)} className={INPUT} />
                </Field>
                <Field label="Vendor / Workshop">
                  <input value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="ABC Garage" className={INPUT} />
                </Field>
                <Field label="Cost (₹)">
                  <input type="number" min={0} value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="15000" className={INPUT} />
                </Field>
                <Field label="Est. Completion Date">
                  <input type="date" value={form.estimatedCompletion} onChange={e => set('estimatedCompletion', e.target.value)} className={INPUT} />
                </Field>
              </div>
              <Field label="Description *">
                <textarea required rows={2} value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Describe the maintenance work..." className={INPUT + ' resize-none'} />
              </Field>
              <Field label="Parts Replaced (comma-separated)">
                <input value={form.parts} onChange={e => set('parts', e.target.value)} placeholder="Air Filter, Oil Filter, Engine Oil" className={INPUT} />
              </Field>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
