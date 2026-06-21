'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface SparePart {
  id: string;
  partNo: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
  unitPrice: number;
  vendor: string;
  location: string;
}

interface LedgerEntry {
  id: string;
  partId: string;
  partName: string;
  type: 'IN' | 'OUT';
  quantity: number;
  date: string;
  vehicleId: string | null;
  regNumber: string | null;
  reference: string;
  vendor: string | null;
  unitPrice: number;
  notes: string;
  balanceAfter: number;
  performedBy: string;
}

interface Summary {
  total: number;
  lowStock: number;
  outOfStock: number;
  totalValue: number;
}

interface Vehicle {
  id: string;
  regNumber: string;
  make: string;
  model: string;
}

const CATEGORIES = ['Engine', 'Brakes', 'Transmission', 'Electrical', 'Suspension', 'Body', 'Other'];
const UNITS = ['Pcs', 'Litre', 'Set', 'Pair', 'Kg', 'Meter'];

const INPUT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const SELECT = INPUT + " bg-white";

const TYPE_COLORS: Record<string, string> = {
  IN: 'bg-green-100 text-green-700',
  OUT: 'bg-blue-100 text-blue-700',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function stockStatus(p: SparePart): { label: string; color: string } {
  if (p.currentStock === 0) return { label: 'Out of Stock', color: 'bg-red-100 text-red-700' };
  if (p.currentStock <= p.reorderLevel) return { label: 'Low Stock', color: 'bg-yellow-100 text-yellow-700' };
  return { label: 'OK', color: 'bg-green-100 text-green-700' };
}

function computeSummary(parts: SparePart[]): Summary {
  const lowStock = parts.filter(p => p.currentStock > 0 && p.currentStock <= p.reorderLevel).length;
  const outOfStock = parts.filter(p => p.currentStock === 0).length;
  const totalValue = parts.reduce((s, p) => s + p.currentStock * p.unitPrice, 0);
  return { total: parts.length, lowStock, outOfStock, totalValue };
}

function EMPTY_FORM() {
  return {
    partNo: '', name: '', category: 'Engine', unit: 'Pcs',
    currentStock: 0, reorderLevel: 0, unitPrice: 0, vendor: '', location: '',
  };
}

function EMPTY_STOCKIN() {
  return { quantity: '', vendor: '', unitPrice: '', reference: '', notes: '' };
}

function EMPTY_ISSUE() {
  return { vehicleId: '', quantity: '', reference: '', notes: '' };
}

export default function SparesPage() {
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [toast, setToast] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [editPart, setEditPart] = useState<SparePart | null>(null);
  const [form, setForm] = useState(EMPTY_FORM());

  const [stockPart, setStockPart] = useState<SparePart | null>(null);
  const [stockForm, setStockForm] = useState(EMPTY_STOCKIN());

  const [issuePart, setIssuePart] = useState<SparePart | null>(null);
  const [issueForm, setIssueForm] = useState(EMPTY_ISSUE());

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.spares(), api.sparesLedger(), api.fleet()])
      .then(([sparesRes, ledgerRes, fleetRes]) => {
        setSpareParts(sparesRes.spareParts);
        setSummary(sparesRes.summary);
        setLedger(ledgerRes);
        setVehicles(fleetRes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }
  function setF(f: string, v: string | number) { setForm(x => ({ ...x, [f]: v })); }
  function setSF(f: string, v: string) { setStockForm(x => ({ ...x, [f]: v })); }
  function setIF(f: string, v: string) { setIssueForm(x => ({ ...x, [f]: v })); }

  function openAdd() { setForm(EMPTY_FORM()); setEditPart(null); setShowAdd(true); }
  function openEdit(p: SparePart) {
    setForm({ partNo: p.partNo, name: p.name, category: p.category, unit: p.unit, currentStock: p.currentStock, reorderLevel: p.reorderLevel, unitPrice: p.unitPrice, vendor: p.vendor, location: p.location });
    setEditPart(p); setShowAdd(true);
  }
  function openStockIn(p: SparePart) {
    setStockForm({ ...EMPTY_STOCKIN(), vendor: p.vendor, unitPrice: String(p.unitPrice) });
    setStockPart(p);
  }
  function openIssue(p: SparePart) {
    setIssueForm(EMPTY_ISSUE());
    setIssuePart(p);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editPart) {
        const { partNo, name, category, unit, reorderLevel, unitPrice, vendor, location } = form;
        const res = await api.updateSparePart(editPart.id, { partNo, name, category, unit, reorderLevel, unitPrice, vendor, location });
        setSpareParts(prev => {
          const updated = prev.map(p => p.id === editPart.id ? res.part : p);
          setSummary(computeSummary(updated));
          return updated;
        });
        notify(`${res.part.name} updated`);
      } else {
        const res = await api.addSparePart(form);
        setSpareParts(prev => {
          const updated = [res.part, ...prev];
          setSummary(computeSummary(updated));
          return updated;
        });
        if (res.part.currentStock > 0) {
          const ledgerRes = await api.sparesLedger();
          setLedger(ledgerRes);
        }
        notify(`Spare part ${res.part.id} added`);
      }
      setShowAdd(false);
    } catch { notify('Save failed'); }
    setSaving(false);
  }

  async function handleStockIn(e: React.FormEvent) {
    e.preventDefault();
    if (!stockPart) return;
    setSaving(true);
    try {
      const res = await api.spareStockIn(stockPart.id, {
        quantity: Number(stockForm.quantity),
        vendor: stockForm.vendor,
        unitPrice: stockForm.unitPrice ? Number(stockForm.unitPrice) : undefined,
        reference: stockForm.reference,
        notes: stockForm.notes,
      });
      setSpareParts(prev => {
        const updated = prev.map(p => p.id === stockPart.id ? res.part : p);
        setSummary(computeSummary(updated));
        return updated;
      });
      setLedger(prev => [res.entry, ...prev]);
      notify(`Stock added: ${stockForm.quantity} ${stockPart.unit} of ${stockPart.name}`);
      setStockPart(null);
    } catch (err) { notify(err instanceof Error ? err.message : 'Stock-in failed'); }
    setSaving(false);
  }

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    if (!issuePart) return;
    setSaving(true);
    try {
      const res = await api.spareIssue(issuePart.id, {
        vehicleId: issueForm.vehicleId,
        quantity: Number(issueForm.quantity),
        reference: issueForm.reference,
        notes: issueForm.notes,
      });
      setSpareParts(prev => {
        const updated = prev.map(p => p.id === issuePart.id ? res.part : p);
        setSummary(computeSummary(updated));
        return updated;
      });
      setLedger(prev => [res.entry, ...prev]);
      notify(`${issueForm.quantity} ${issuePart.unit} of ${issuePart.name} issued to ${res.entry.regNumber}`);
      setIssuePart(null);
    } catch (err) { notify(err instanceof Error ? err.message : 'Issue failed'); }
    setSaving(false);
  }

  const categories = Array.from(new Set(spareParts.map(p => p.category)));
  const filterOpts = ['All', ...categories, 'Low Stock', 'Out of Stock'];

  const filtered = spareParts.filter(p => {
    const matchFilter =
      filter === 'All'          ? true :
      filter === 'Low Stock'    ? (p.currentStock > 0 && p.currentStock <= p.reorderLevel) :
      filter === 'Out of Stock' ? p.currentStock === 0 :
      p.category === filter;
    const matchSearch =
      p.partNo.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.vendor.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts: Record<string, number> = { All: spareParts.length };
  categories.forEach(c => { counts[c] = spareParts.filter(p => p.category === c).length; });
  counts['Low Stock'] = spareParts.filter(p => p.currentStock > 0 && p.currentStock <= p.reorderLevel).length;
  counts['Out of Stock'] = spareParts.filter(p => p.currentStock === 0).length;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-5">
      {toast && <div className="fixed top-5 right-5 z-50 bg-slate-800 text-white px-4 py-2.5 rounded-lg shadow-xl text-sm">{toast}</div>}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Items',       value: summary.total,     color: 'text-slate-800' },
            { label: 'Low Stock',         value: summary.lowStock,  color: 'text-yellow-600' },
            { label: 'Out of Stock',      value: summary.outOfStock,color: 'text-red-600' },
            { label: 'Total Stock Value', value: `₹${(summary.totalValue/100000).toFixed(1)}L`, color: 'text-slate-700' },
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

      {/* Inventory table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center gap-4 flex-wrap">
          <button onClick={openAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Spare Part
          </button>
          <input type="text" placeholder="Search part no, name, category, vendor..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-72 ml-auto" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Part', 'Category', 'Stock', 'Reorder Level', 'Unit Price', 'Stock Value', 'Vendor / Location', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(p => {
                const ss = stockStatus(p);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-800">{p.name}</div>
                      <div className="text-xs text-slate-400 font-mono">{p.partNo}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{p.category}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">{p.currentStock} {p.unit}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{p.reorderLevel} {p.unit}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">₹{p.unitPrice.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700 whitespace-nowrap">₹{(p.currentStock * p.unitPrice).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-700">{p.vendor}</div>
                      <div className="text-xs text-slate-400">{p.location}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ss.color}`}>{ss.label}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openStockIn(p)} className="text-green-600 hover:text-green-800 text-xs font-medium border border-green-200 px-2 py-0.5 rounded">Add Stock</button>
                        <button onClick={() => openIssue(p)} disabled={p.currentStock === 0}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium border border-blue-200 px-2 py-0.5 rounded disabled:opacity-40 disabled:cursor-not-allowed">Issue</button>
                        <button onClick={() => openEdit(p)} className="text-slate-500 hover:text-slate-700 text-xs font-medium border border-slate-200 px-2 py-0.5 rounded">Edit</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="text-center text-slate-400 text-sm py-10">No spare parts match your filter.</div>}
        </div>
      </div>

      {/* Ledger table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Spare Parts Ledger</h3>
          <p className="text-xs text-slate-400 mt-0.5">Chronological record of stock-in (purchase/restock) and stock-out (issued to vehicle) movements</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Date', 'Part', 'Type', 'Qty', 'Vehicle', 'Reference', 'Vendor / Unit Price', 'Balance After', 'Notes', 'By'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ledger.map(l => (
                <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{l.date}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-800">{l.partName}</div>
                    <div className="text-xs text-slate-400 font-mono">{l.partId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[l.type]}`}>{l.type}</span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700">{l.quantity}</td>
                  <td className="px-4 py-3">
                    {l.vehicleId ? (
                      <>
                        <div className="text-xs font-semibold text-slate-700">{l.vehicleId}</div>
                        <div className="text-xs text-slate-400 font-mono">{l.regNumber}</div>
                      </>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{l.reference || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-slate-700">{l.vendor || '—'}</div>
                    <div className="text-xs text-slate-400">₹{l.unitPrice.toLocaleString('en-IN')}</div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{l.balanceAfter}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate" title={l.notes}>{l.notes || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{l.performedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ledger.length === 0 && <div className="text-center text-slate-400 text-sm py-10">No ledger entries yet.</div>}
        </div>
      </div>

      {/* ── Add / Edit Spare Part Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="text-base font-bold text-slate-800">{editPart ? `Edit Spare Part — ${editPart.id}` : 'Add New Spare Part'}</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Part No"><input required value={form.partNo} onChange={e => setF('partNo', e.target.value)} className={INPUT} /></Field>
                <Field label="Part Name"><input required value={form.name} onChange={e => setF('name', e.target.value)} className={INPUT} /></Field>
                <Field label="Category">
                  <select value={form.category} onChange={e => setF('category', e.target.value)} className={SELECT}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Unit">
                  <select value={form.unit} onChange={e => setF('unit', e.target.value)} className={SELECT}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                {!editPart && (
                  <Field label="Opening Stock">
                    <input type="number" min="0" value={form.currentStock} onChange={e => setF('currentStock', Number(e.target.value))} className={INPUT} />
                  </Field>
                )}
                <Field label="Reorder Level"><input type="number" min="0" value={form.reorderLevel} onChange={e => setF('reorderLevel', Number(e.target.value))} className={INPUT} /></Field>
                <Field label="Unit Price (₹)"><input type="number" min="0" value={form.unitPrice} onChange={e => setF('unitPrice', Number(e.target.value))} className={INPUT} /></Field>
                <Field label="Vendor"><input value={form.vendor} onChange={e => setF('vendor', e.target.value)} className={INPUT} /></Field>
                <Field label="Storage Location"><input value={form.location} onChange={e => setF('location', e.target.value)} className={INPUT} /></Field>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : editPart ? 'Save Changes' : 'Add Part'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Stock Modal ── */}
      {stockPart && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="text-base font-bold text-slate-800">Add Stock — {stockPart.name}</h3>
              <button onClick={() => setStockPart(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleStockIn} className="p-6 space-y-4">
              <p className="text-xs text-slate-500">Current stock: <span className="font-semibold text-slate-700">{stockPart.currentStock} {stockPart.unit}</span></p>
              <Field label={`Quantity to Add (${stockPart.unit})`}>
                <input type="number" min="1" required value={stockForm.quantity} onChange={e => setSF('quantity', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Unit Price (₹)"><input type="number" min="0" value={stockForm.unitPrice} onChange={e => setSF('unitPrice', e.target.value)} className={INPUT} /></Field>
              <Field label="Vendor"><input value={stockForm.vendor} onChange={e => setSF('vendor', e.target.value)} className={INPUT} /></Field>
              <Field label="Reference"><input placeholder="e.g. Invoice / PO No." value={stockForm.reference} onChange={e => setSF('reference', e.target.value)} className={INPUT} /></Field>
              <Field label="Notes"><textarea rows={2} value={stockForm.notes} onChange={e => setSF('notes', e.target.value)} className={INPUT} /></Field>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setStockPart(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Add Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Issue Spare Modal ── */}
      {issuePart && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="text-base font-bold text-slate-800">Issue Spare — {issuePart.name}</h3>
              <button onClick={() => setIssuePart(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleIssue} className="p-6 space-y-4">
              <p className="text-xs text-slate-500">Available stock: <span className="font-semibold text-slate-700">{issuePart.currentStock} {issuePart.unit}</span></p>
              <Field label="Vehicle">
                <select required value={issueForm.vehicleId} onChange={e => setIF('vehicleId', e.target.value)} className={SELECT}>
                  <option value="">Select vehicle...</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.id} — {v.regNumber} ({v.make} {v.model})</option>)}
                </select>
              </Field>
              <Field label={`Quantity (${issuePart.unit})`}>
                <input type="number" min="1" max={issuePart.currentStock} required value={issueForm.quantity} onChange={e => setIF('quantity', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Reference"><input placeholder="e.g. Maintenance record ID" value={issueForm.reference} onChange={e => setIF('reference', e.target.value)} className={INPUT} /></Field>
              <Field label="Notes"><textarea rows={2} value={issueForm.notes} onChange={e => setIF('notes', e.target.value)} className={INPUT} /></Field>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIssuePart(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
