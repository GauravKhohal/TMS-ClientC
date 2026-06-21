'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';

interface Tyre {
  id: string; serialNo: string; brand: string; model: string;
  size: string; type: string; vehicleId: string; regNumber: string;
  position: string; purchaseDate: string; purchasePrice: number;
  vendor: string; invoiceNo: string;
  warrantyType: string; warrantyKm: number; warrantyExpiry: string | null;
  kmAtFitment: number; expectedLifeKm: number; currentKmRun: number;
  treadDepth: number; lastPressureCheck: string; lastRotationDate: string | null;
  retreads: number; status: string; notes: string;
}
interface Summary {
  total: number; inUse: number; spare: number;
  underWarranty: number; critical: number; condemned: number; totalValue: number;
}

const BRANDS   = ['MRF', 'CEAT', 'Apollo', 'JK Tyre', 'Bridgestone', 'Michelin', 'Goodyear', 'Continental', 'Yokohama'];
const SIZES    = ['295/80 R22.5', '315/80 R22.5', '11.00 R20', '10.00 R20', '12.00 R20', '8.25 R20', '7.50 R16'];
const POSITIONS= ['Front Left', 'Front Right', 'Rear Left Outer', 'Rear Left Inner', 'Rear Right Outer', 'Rear Right Inner', 'Trailer Left Outer', 'Trailer Left Inner', 'Trailer Right Outer', 'Trailer Right Inner', 'Spare'];
const STATUSES = ['In Use', 'Spare', 'Retreaded', 'Repair', 'Condemned'];

const STATUS_COLORS: Record<string, string> = {
  'In Use':    'bg-green-100 text-green-700',
  'Spare':     'bg-blue-100 text-blue-700',
  'Retreaded': 'bg-yellow-100 text-yellow-700',
  'Repair':    'bg-orange-100 text-orange-700',
  'Condemned': 'bg-red-100 text-red-700',
};

const INPUT  = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const SELECT = INPUT + ' bg-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function lifeColor(pct: number) {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 75) return 'bg-orange-400';
  if (pct >= 50) return 'bg-yellow-400';
  return 'bg-green-500';
}
function lifeTextColor(pct: number) {
  if (pct >= 90) return 'text-red-600';
  if (pct >= 75) return 'text-orange-600';
  if (pct >= 50) return 'text-yellow-600';
  return 'text-green-600';
}

function warrantyStatus(t: Tyre): { label: string; color: string } {
  if (t.warrantyType === 'None' || (!t.warrantyExpiry && !t.warrantyKm)) return { label: 'No Warranty', color: 'text-slate-400' };
  const dateOk = t.warrantyExpiry ? new Date(t.warrantyExpiry) > new Date() : true;
  const kmOk   = t.warrantyKm ? t.currentKmRun < t.warrantyKm : true;
  if (t.warrantyType === 'KM')   return kmOk   ? { label: `${(t.warrantyKm - t.currentKmRun).toLocaleString()} km left`, color: 'text-green-600' } : { label: 'KM Expired', color: 'text-red-600' };
  if (t.warrantyType === 'Date') return dateOk ? { label: `Till ${t.warrantyExpiry}`, color: 'text-green-600' }                                       : { label: 'Date Expired', color: 'text-red-600' };
  if (t.warrantyType === 'Both') {
    if (dateOk && kmOk)   return { label: 'Active', color: 'text-green-600' };
    if (!dateOk && !kmOk) return { label: 'Expired', color: 'text-red-600' };
    return { label: 'Partially Expired', color: 'text-orange-600' };
  }
  return { label: '—', color: 'text-slate-400' };
}

const EMPTY_FORM = () => ({
  serialNo: '', brand: 'MRF', model: '', size: '295/80 R22.5', type: 'Tubeless',
  vehicleId: '', position: 'Front Left',
  purchaseDate: new Date().toISOString().split('T')[0], purchasePrice: 0,
  vendor: '', invoiceNo: '',
  warrantyType: 'Both', warrantyKm: 0, warrantyExpiry: '',
  kmAtFitment: 0, expectedLifeKm: 100000, currentKmRun: 0,
  treadDepth: 16, lastPressureCheck: new Date().toISOString().split('T')[0],
  lastRotationDate: '', retreads: 0, status: 'In Use', notes: '',
});

export default function TyresPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <TyresPageInner />
    </Suspense>
  );
}

function TyresPageInner() {
  const searchParams = useSearchParams();
  const searchParam = searchParams.get('search');

  const [tyres,   setTyres]   = useState<Tyre[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('All');
  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange } = useDateRange();
  const [search,  setSearch]  = useState(searchParam || '');
  const [selected, setSelected] = useState<Tyre | null>(null);
  const [showAdd,  setShowAdd]  = useState(false);
  const [editTyre, setEditTyre] = useState<Tyre | null>(null);
  const [form,     setForm]     = useState(EMPTY_FORM());
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.tyres()
      .then((d: { tyres: Tyre[]; summary: Summary }) => { setTyres(d.tyres); setSummary(d.summary); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }
  function setF(f: string, v: string | number) { setForm(x => ({ ...x, [f]: v })); }

  function openAdd() { setForm(EMPTY_FORM()); setShowAdd(true); setEditTyre(null); }
  function openEdit(t: Tyre) {
    setForm({ ...t, warrantyExpiry: t.warrantyExpiry || '', lastRotationDate: t.lastRotationDate || '' });
    setEditTyre(t); setShowAdd(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editTyre) {
        const res = await api.updateTyre(editTyre.id, form);
        setTyres(prev => prev.map(t => t.id === editTyre.id ? res.tyre : t));
        notify('Tyre updated');
      } else {
        const res = await api.addTyre(form);
        setTyres(prev => [res.tyre, ...prev]);
        notify(`Tyre ${res.tyre.id} added`);
      }
      setShowAdd(false);
    } catch { notify('Save failed'); }
    setSaving(false);
  }

  async function handleStatusChange(tyre: Tyre, newStatus: string) {
    try {
      const res = await api.updateTyre(tyre.id, { status: newStatus });
      setTyres(prev => prev.map(t => t.id === tyre.id ? res.tyre : t));
      if (selected?.id === tyre.id) setSelected(res.tyre);
      notify(`${tyre.id} marked as ${newStatus}`);
    } catch { notify('Update failed'); }
  }

  // Excel download
  function downloadExcel() {
    const rows = filtered.map(t => ({
      'Tyre ID': t.id, 'Serial No': t.serialNo, 'Brand': t.brand, 'Model': t.model,
      'Size': t.size, 'Type': t.type, 'Vehicle': t.vehicleId, 'Reg No': t.regNumber,
      'Position': t.position, 'Purchase Date': t.purchaseDate, 'Purchase Price (₹)': t.purchasePrice,
      'Vendor': t.vendor, 'Invoice No': t.invoiceNo,
      'Warranty Type': t.warrantyType, 'Warranty KM': t.warrantyKm, 'Warranty Expiry': t.warrantyExpiry || '',
      'KM at Fitment': t.kmAtFitment, 'Expected Life (KM)': t.expectedLifeKm, 'Current KM Run': t.currentKmRun,
      'Tread Depth (mm)': t.treadDepth, 'Last Pressure Check': t.lastPressureCheck,
      'Last Rotation': t.lastRotationDate || '', 'Retreads': t.retreads, 'Status': t.status, 'Notes': t.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tyres');
    XLSX.writeFile(wb, 'tyre_inventory.xlsx');
  }

  const filterOpts = ['All', 'In Use', 'Spare', 'Retreaded', 'Repair', 'Condemned', 'Critical', 'Under Warranty'];
  const filtered = tyres.filter(t => {
    const pct = t.expectedLifeKm > 0 ? (t.currentKmRun / t.expectedLifeKm) * 100 : 0;
    const matchFilter =
      filter === 'All'           ? true :
      filter === 'Critical'      ? (t.status === 'In Use' && pct >= 85) :
      filter === 'Under Warranty'? warrantyStatus(t).color === 'text-green-600' :
      t.status === filter;
    const matchSearch =
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.serialNo.toLowerCase().includes(search.toLowerCase()) ||
      t.brand.toLowerCase().includes(search.toLowerCase()) ||
      t.vehicleId.toLowerCase().includes(search.toLowerCase()) ||
      t.regNumber.toLowerCase().includes(search.toLowerCase());
    const matchDate = inRange(t.purchaseDate);
    return matchFilter && matchSearch && matchDate;
  });

  const counts: Record<string, number> = {
    All: tyres.length,
    'In Use': tyres.filter(t => t.status === 'In Use').length,
    Spare: tyres.filter(t => t.status === 'Spare').length,
    Retreaded: tyres.filter(t => t.status === 'Retreaded').length,
    Repair: tyres.filter(t => t.status === 'Repair').length,
    Condemned: tyres.filter(t => t.status === 'Condemned').length,
    Critical: tyres.filter(t => t.status === 'In Use' && t.expectedLifeKm > 0 && (t.currentKmRun / t.expectedLifeKm) >= 0.85).length,
    'Under Warranty': tyres.filter(t => warrantyStatus(t).color === 'text-green-600').length,
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-5">
      {toast && <div className="fixed top-5 right-5 z-50 bg-slate-800 text-white px-4 py-2.5 rounded-lg shadow-xl text-sm">{toast}</div>}

      <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} count={filtered.length} total={tyres.length} />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total Tyres',     value: summary.total,        color: 'text-slate-800' },
            { label: 'In Use',          value: summary.inUse,        color: 'text-green-600' },
            { label: 'Spare',           value: summary.spare,        color: 'text-blue-600' },
            { label: 'Under Warranty',  value: summary.underWarranty,color: 'text-purple-600' },
            { label: 'Critical (≥85%)', value: summary.critical,     color: 'text-red-600' },
            { label: 'Condemned',       value: summary.condemned,    color: 'text-slate-500' },
            { label: 'Total Value',     value: `₹${(summary.totalValue/100000).toFixed(1)}L`, color: 'text-slate-700' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
              <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {filterOpts.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
            {f} <span className="ml-1 opacity-70">({counts[f] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Main table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <input ref={uploadRef} type="file" accept=".xlsx,.xls" className="hidden" />
            <button onClick={downloadExcel}
              className="px-3 py-2 text-sm text-blue-700 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download Excel
            </button>
            <button onClick={openAdd}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Tyre
            </button>
          </div>
          <input type="text" placeholder="Search tyre ID, serial no, brand, vehicle..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-72 ml-auto" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Tyre ID', 'Brand / Model', 'Size', 'Vehicle', 'Position', 'Purchase', 'KM at Fitment', 'KM Run', 'Life Used', 'Tread', 'Warranty', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(t => {
                const pct = t.expectedLifeKm > 0 ? Math.round((t.currentKmRun / t.expectedLifeKm) * 100) : 0;
                const ws  = warrantyStatus(t);
                return (
                  <tr key={t.id} className={`hover:bg-slate-50 transition-colors ${t.status === 'Condemned' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{t.id}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-800">{t.brand}</div>
                      <div className="text-xs text-slate-500">{t.model} · {t.type}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600 whitespace-nowrap">{t.size}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-semibold text-slate-700">{t.vehicleId}</div>
                      <div className="text-xs text-slate-400 font-mono">{t.regNumber}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.position}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-700">{t.purchaseDate}</div>
                      <div className="text-xs text-slate-500">₹{t.purchasePrice.toLocaleString('en-IN')}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {t.kmAtFitment > 0 ? `${t.kmAtFitment.toLocaleString('en-IN')} km` : '0 km'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700 whitespace-nowrap">
                      {t.currentKmRun.toLocaleString('en-IN')} km
                      {t.retreads > 0 && <div className="text-xs text-yellow-600">{t.retreads}× retreaded</div>}
                    </td>
                    <td className="px-4 py-3">
                      {t.expectedLifeKm > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 bg-slate-100 rounded-full">
                            <div className={`h-1.5 rounded-full ${lifeColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className={`text-xs font-medium ${lifeTextColor(pct)}`}>{pct}%</span>
                        </div>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className={`text-xs font-medium ${t.treadDepth <= 2 ? 'text-red-600' : t.treadDepth <= 4 ? 'text-orange-600' : 'text-slate-700'}`}>
                        {t.treadDepth} mm
                      </div>
                      {t.treadDepth <= 2 && <div className="text-xs text-red-500">Replace now</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${ws.color}`}>{ws.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap flex items-center gap-2">
                      <button onClick={() => setSelected(t)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">View</button>
                      <button onClick={() => openEdit(t)} className="text-slate-500 hover:text-slate-700 text-xs font-medium border border-slate-200 px-2 py-0.5 rounded">Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="text-center text-slate-400 text-sm py-10">No tyres match your filter.</div>}
        </div>
      </div>

      {/* ── Add / Edit Tyre Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="text-base font-bold text-slate-800">{editTyre ? `Edit Tyre — ${editTyre.id}` : 'Add New Tyre'}</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-6">

              {/* Identity */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Tyre Identity</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Serial Number *">
                    <input required className={INPUT} value={form.serialNo} onChange={e => setF('serialNo', e.target.value)} placeholder="MRF-SM-2024-001" />
                  </Field>
                  <Field label="Brand *">
                    <select required className={SELECT} value={form.brand} onChange={e => setF('brand', e.target.value)}>
                      {BRANDS.map(b => <option key={b}>{b}</option>)}
                    </select>
                  </Field>
                  <Field label="Model / Pattern *">
                    <input required className={INPUT} value={form.model} onChange={e => setF('model', e.target.value)} placeholder="STEEL MUSCLE" />
                  </Field>
                  <Field label="Size *">
                    <select required className={SELECT} value={form.size} onChange={e => setF('size', e.target.value)}>
                      {SIZES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Type *">
                    <select required className={SELECT} value={form.type} onChange={e => setF('type', e.target.value)}>
                      <option>Tubeless</option><option>Tube Type</option>
                    </select>
                  </Field>
                  <Field label="Status *">
                    <select required className={SELECT} value={form.status} onChange={e => setF('status', e.target.value)}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              {/* Vehicle Assignment */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Vehicle Assignment</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Vehicle ID">
                    <input className={INPUT} value={form.vehicleId} onChange={e => setF('vehicleId', e.target.value)} placeholder="V001" />
                  </Field>
                  <Field label="Position on Vehicle">
                    <select className={SELECT} value={form.position} onChange={e => setF('position', e.target.value)}>
                      {POSITIONS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              {/* Purchase */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Purchase Details</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Purchase Date *">
                    <input required type="date" className={INPUT} value={form.purchaseDate} onChange={e => setF('purchaseDate', e.target.value)} />
                  </Field>
                  <Field label="Purchase Price (₹) *">
                    <input required type="number" min={0} className={INPUT} value={form.purchasePrice || ''} onChange={e => setF('purchasePrice', parseInt(e.target.value) || 0)} placeholder="27000" />
                  </Field>
                  <Field label="Vendor / Dealer *">
                    <input required className={INPUT} value={form.vendor} onChange={e => setF('vendor', e.target.value)} placeholder="MRF Dealer Pune" />
                  </Field>
                  <Field label="Invoice Number">
                    <input className={INPUT} value={form.invoiceNo} onChange={e => setF('invoiceNo', e.target.value)} placeholder="INV-MRF-4521" />
                  </Field>
                </div>
              </div>

              {/* Warranty */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Warranty</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Warranty Type *">
                    <select required className={SELECT} value={form.warrantyType} onChange={e => setF('warrantyType', e.target.value)}>
                      <option value="None">No Warranty</option>
                      <option value="KM">KM Based</option>
                      <option value="Date">Date Based</option>
                      <option value="Both">Both (KM + Date)</option>
                    </select>
                  </Field>
                  {(form.warrantyType === 'KM' || form.warrantyType === 'Both') && (
                    <Field label="Warranty KM Limit">
                      <input type="number" min={0} className={INPUT} value={form.warrantyKm || ''} onChange={e => setF('warrantyKm', parseInt(e.target.value) || 0)} placeholder="120000" />
                    </Field>
                  )}
                  {(form.warrantyType === 'Date' || form.warrantyType === 'Both') && (
                    <Field label="Warranty Expiry Date">
                      <input type="date" className={INPUT} value={form.warrantyExpiry} onChange={e => setF('warrantyExpiry', e.target.value)} />
                    </Field>
                  )}
                </div>
              </div>

              {/* Usage & Condition */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Usage &amp; Condition</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="KM at Fitment">
                    <input type="number" min={0} className={INPUT} value={form.kmAtFitment || ''} onChange={e => setF('kmAtFitment', parseInt(e.target.value) || 0)} placeholder="0" />
                  </Field>
                  <Field label="Expected Life (KM) *">
                    <input required type="number" min={1} className={INPUT} value={form.expectedLifeKm || ''} onChange={e => setF('expectedLifeKm', parseInt(e.target.value) || 0)} placeholder="120000" />
                  </Field>
                  <Field label="Current KM Run">
                    <input type="number" min={0} className={INPUT} value={form.currentKmRun || ''} onChange={e => setF('currentKmRun', parseInt(e.target.value) || 0)} placeholder="45000" />
                  </Field>
                  <Field label="Tread Depth (mm) *">
                    <input required type="number" step="0.1" min={0} max={20} className={INPUT} value={form.treadDepth || ''} onChange={e => setF('treadDepth', parseFloat(e.target.value) || 0)} placeholder="16.0" />
                  </Field>
                  <Field label="Last Pressure Check">
                    <input type="date" className={INPUT} value={form.lastPressureCheck} onChange={e => setF('lastPressureCheck', e.target.value)} />
                  </Field>
                  <Field label="Last Rotation Date">
                    <input type="date" className={INPUT} value={form.lastRotationDate} onChange={e => setF('lastRotationDate', e.target.value)} />
                  </Field>
                  <Field label="Number of Retreads">
                    <input type="number" min={0} max={5} className={INPUT} value={form.retreads} onChange={e => setF('retreads', parseInt(e.target.value) || 0)} />
                  </Field>
                </div>
              </div>

              <div>
                <Field label="Notes">
                  <textarea rows={2} className={INPUT} value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Any observations, repair history, or remarks..." />
                </Field>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Saving…' : editTyre ? 'Save Changes' : 'Add Tyre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Tyre Detail Modal ── */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selected.id} — {selected.brand} {selected.model}</h3>
                <p className="text-xs text-slate-500">{selected.size} · {selected.type} · {selected.vehicleId} · {selected.position}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Life meter */}
            {selected.expectedLifeKm > 0 && (() => {
              const pct = Math.round((selected.currentKmRun / selected.expectedLifeKm) * 100);
              return (
                <div className={`rounded-xl p-4 mb-5 ${pct >= 90 ? 'bg-red-50 border border-red-200' : pct >= 75 ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-100'}`}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold text-slate-700">Tyre Life Used</span>
                    <span className={`font-bold ${lifeTextColor(pct)}`}>{pct}% ({selected.currentKmRun.toLocaleString('en-IN')} / {selected.expectedLifeKm.toLocaleString('en-IN')} km)</span>
                  </div>
                  <div className="h-3 bg-white rounded-full border border-slate-200">
                    <div className={`h-full rounded-full ${lifeColor(pct)} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>0 km</span>
                    <span className={`font-medium ${lifeTextColor(pct)}`}>{Math.max(0, selected.expectedLifeKm - selected.currentKmRun).toLocaleString('en-IN')} km remaining</span>
                    <span>{selected.expectedLifeKm.toLocaleString('en-IN')} km</span>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-3 text-sm mb-5">
              {[
                ['Serial No', selected.serialNo],
                ['Brand', `${selected.brand} ${selected.model}`],
                ['Size', selected.size],
                ['Type', selected.type],
                ['Vehicle', `${selected.vehicleId} (${selected.regNumber})`],
                ['Position', selected.position],
                ['Purchase Date', selected.purchaseDate],
                ['Purchase Price', `₹${selected.purchasePrice.toLocaleString('en-IN')}`],
                ['Vendor', selected.vendor],
                ['Invoice No', selected.invoiceNo || '—'],
                ['Warranty', warrantyStatus(selected).label],
                ['KM at Fitment', selected.kmAtFitment.toLocaleString('en-IN') + ' km'],
                ['Tread Depth', `${selected.treadDepth} mm ${selected.treadDepth <= 2 ? '⚠ Replace!' : ''}`],
                ['Last Pressure Check', selected.lastPressureCheck || '—'],
                ['Last Rotation', selected.lastRotationDate || '—'],
                ['Times Retreaded', String(selected.retreads)],
                ['Cost per KM', selected.currentKmRun > 0 ? `₹${(selected.purchasePrice / selected.currentKmRun).toFixed(2)}/km` : '—'],
              ].map(([k, v]) => (
                <div key={k as string}><div className="text-xs text-slate-500">{k}</div><div className="font-medium text-slate-800">{v}</div></div>
              ))}
            </div>

            {selected.notes && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <strong>Notes:</strong> {selected.notes}
              </div>
            )}

            {/* Quick status change */}
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Change Status</p>
              <div className="flex gap-2 flex-wrap">
                {STATUSES.filter(s => s !== selected.status).map(s => (
                  <button key={s} onClick={() => handleStatusChange(selected, s)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${STATUS_COLORS[s]} hover:opacity-80`}>
                    Mark as {s}
                  </button>
                ))}
                <button onClick={() => { setSelected(null); openEdit(selected); }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50">
                  Edit Full Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
