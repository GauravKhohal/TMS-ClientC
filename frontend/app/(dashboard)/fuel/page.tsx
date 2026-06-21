'use client';
import { Fragment, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';
import { api } from '@/lib/api';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';

interface FuelEntry {
  id: string; vehicleId: string; date: string; liters: number;
  pricePerLiter: number; totalCost: number; odometer: number;
  kmpl: number; station: string; fuelCardUsed: boolean; tripId: string | null;
}
interface Analytics {
  fuelTrend: { month: string; totalLiters: number; avgKmpl: number; cost: number }[];
}

const EMPTY_FORM = {
  vehicleId: '', date: new Date().toISOString().split('T')[0], liters: '',
  pricePerLiter: '97.5', odometer: '', station: '', fuelCardUsed: false, tripId: '',
};

const INPUT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const SELECT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>{children}</div>;
}

interface FuelGroup {
  key: string;
  tripId: string | null;
  vehicleId: string;
  fillUps: FuelEntry[];
  totalLiters: number;
  totalCost: number;
  avgKmpl: number;
  lastDate: string;
  stationLabel: string;
  cardLabel: string;
}

// Groups fill-ups that share a trip so the table shows one row per trip with
// the combined litres/cost — clicking it reveals each individual fill-up.
function groupByTrip(entries: FuelEntry[]): FuelGroup[] {
  const map = new Map<string, FuelEntry[]>();
  for (const e of entries) {
    const key = e.tripId || `single-${e.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.values()).map(list => {
    const fillUps = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const totalLiters = fillUps.reduce((s, e) => s + e.liters, 0);
    const totalCost = fillUps.reduce((s, e) => s + e.totalCost, 0);
    const avgKmpl = fillUps.reduce((s, e) => s + e.kmpl, 0) / fillUps.length;
    const stations = Array.from(new Set(fillUps.map(e => e.station)));
    const cardUsed = fillUps.some(e => e.fuelCardUsed);
    const cashUsed = fillUps.some(e => !e.fuelCardUsed);
    return {
      key: fillUps[0].tripId || `single-${fillUps[0].id}`,
      tripId: fillUps[0].tripId,
      vehicleId: fillUps[0].vehicleId,
      fillUps,
      totalLiters,
      totalCost,
      avgKmpl,
      lastDate: fillUps[fillUps.length - 1].date,
      stationLabel: stations.length === 1 ? stations[0] : `${stations.length} locations`,
      cardLabel: cardUsed && cashUsed ? 'Mixed' : cardUsed ? 'Card' : 'Cash',
    };
  }).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

export default function FuelPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <FuelPageInner />
    </Suspense>
  );
}

function FuelPageInner() {
  const searchParams = useSearchParams();
  const tripParam = searchParams.get('trip');

  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange } = useDateRange();

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    setMounted(true);
    Promise.all([api.fuel(), api.analytics()])
      .then(([f, a]) => { setEntries(f); setAnalytics(a); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Deep-link from Costing page: ?trip=T001 expands that trip's fill-up group and scrolls to it
  useEffect(() => {
    if (!tripParam || !entries.length) return;
    setExpanded(prev => new Set(prev).add(tripParam));
    const el = document.getElementById(`fuel-group-${tripParam}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [tripParam, entries]);

  const filteredEntries = entries.filter(e => inRange(e.date));
  const groups = groupByTrip(filteredEntries);
  const totalCost = filteredEntries.reduce((s, e) => s + e.totalCost, 0);
  const totalLiters = filteredEntries.reduce((s, e) => s + e.liters, 0);
  const avgKmpl = filteredEntries.reduce((s, e) => s + e.kmpl, 0) / (filteredEntries.length || 1);

  function set(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const newEntry: FuelEntry = await api.addFuelEntry({
        vehicleId: form.vehicleId,
        date: form.date,
        liters: parseFloat(form.liters),
        pricePerLiter: parseFloat(form.pricePerLiter),
        odometer: parseInt(form.odometer) || 0,
        station: form.station,
        fuelCardUsed: form.fuelCardUsed,
        tripId: form.tripId || null,
      });
      setEntries(prev => [newEntry, ...prev]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      setSuccessMsg(`Fuel entry added — ₹${newEntry.totalCost.toLocaleString('en-IN')} for ${newEntry.liters}L`);
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

      <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} count={filteredEntries.length} total={entries.length} />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Fuel Cost', value: `₹${(totalCost / 1000).toFixed(1)}K` },
          { label: 'Total Litres Consumed', value: `${totalLiters.toLocaleString()} L` },
          { label: 'Avg Fleet Efficiency', value: `${avgKmpl.toFixed(2)} km/L` },
          { label: 'Fuel Card Transactions', value: filteredEntries.filter(e => e.fuelCardUsed).length },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className="text-2xl font-bold text-slate-800">{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {mounted && <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Monthly Fuel Cost (₹)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analytics?.fuelTrend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Cost']} />
              <Bar dataKey="cost" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Fuel Cost" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Fleet Avg KM/L Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={analytics?.fuelTrend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[3.5, 5]} />
              <Tooltip />
              <Line type="monotone" dataKey="avgKmpl" stroke="#10b981" strokeWidth={2} name="Avg KM/L" dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>}

      {/* Entries Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Fuel Entries Log</h3>
            <p className="text-xs text-slate-400 mt-0.5">Litres shown is the trip total — click a value with multiple fill-ups to see the station-wise split</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Fuel Entry
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Vehicle', 'Date', 'Litres', 'Price/L', 'Total Cost', 'KM/L', 'Station', 'Fuel Card', 'Trip ID'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {groups.map(g => {
                const multi = g.fillUps.length > 1;
                const isOpen = expanded.has(g.key);
                return (
                  <Fragment key={g.key}>
                    <tr id={`fuel-group-${g.key}`} className={`hover:bg-slate-50 ${tripParam === g.key ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-sm font-medium text-slate-700">{g.vehicleId}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{g.lastDate}</td>
                      <td className="px-4 py-3 text-sm">
                        {multi ? (
                          <button onClick={() => toggleExpand(g.key)}
                            className="flex items-center gap-1.5 font-medium text-blue-700 hover:text-blue-800 hover:underline">
                            <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            {g.totalLiters} L
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">{g.fillUps.length} fill-ups</span>
                          </button>
                        ) : (
                          <span className="font-medium text-slate-800">{g.totalLiters} L</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{multi ? `₹${(g.totalCost / g.totalLiters).toFixed(1)} avg` : `₹${g.fillUps[0].pricePerLiter}`}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800">₹{g.totalCost.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium ${g.avgKmpl >= 4.5 ? 'text-green-600' : g.avgKmpl >= 4 ? 'text-yellow-600' : 'text-red-500'}`}>{g.avgKmpl.toFixed(1)} km/L</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{g.stationLabel}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${g.cardLabel === 'Card' ? 'bg-blue-100 text-blue-700' : g.cardLabel === 'Mixed' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'}`}>
                          {g.cardLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500">{g.tripId || '—'}</td>
                    </tr>
                    {multi && isOpen && g.fillUps.map(e => (
                      <tr key={e.id} className="bg-slate-50/70 text-xs">
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2 pl-8 text-slate-500">↳ {e.date}</td>
                        <td className="px-4 py-2 text-slate-700 font-medium">{e.liters} L</td>
                        <td className="px-4 py-2 text-slate-500">₹{e.pricePerLiter}</td>
                        <td className="px-4 py-2 text-slate-600 font-medium">₹{e.totalCost.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-2 text-slate-500">{e.kmpl} km/L</td>
                        <td className="px-4 py-2 text-slate-600">{e.station}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${e.fuelCardUsed ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                            {e.fuelCardUsed ? 'Card' : 'Cash'}
                          </span>
                        </td>
                        <td className="px-4 py-2"></td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Fuel Entry Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Add Fuel Entry</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Vehicle ID *">
                  <input required value={form.vehicleId} onChange={e => set('vehicleId', e.target.value)} placeholder="V001" className={INPUT} />
                </Field>
                <Field label="Date *">
                  <input required type="date" value={form.date} onChange={e => set('date', e.target.value)} className={INPUT} />
                </Field>
                <Field label="Litres Filled *">
                  <input required type="number" step="0.1" min={1} value={form.liters} onChange={e => set('liters', e.target.value)} placeholder="120" className={INPUT} />
                </Field>
                <Field label="Price per Litre (₹) *">
                  <input required type="number" step="0.1" value={form.pricePerLiter} onChange={e => set('pricePerLiter', e.target.value)} className={INPUT} />
                </Field>
                <Field label="Odometer Reading (km)">
                  <input type="number" value={form.odometer} onChange={e => set('odometer', e.target.value)} placeholder="145000" className={INPUT} />
                </Field>
                <Field label="Fuel Station">
                  <input value={form.station} onChange={e => set('station', e.target.value)} placeholder="HPCL Pune" className={INPUT} />
                </Field>
                <Field label="Linked Trip ID">
                  <input value={form.tripId} onChange={e => set('tripId', e.target.value)} placeholder="T001 (optional)" className={INPUT} />
                </Field>
                <Field label="Payment Method">
                  <select value={form.fuelCardUsed ? 'card' : 'cash'} onChange={e => set('fuelCardUsed', e.target.value === 'card')} className={SELECT}>
                    <option value="cash">Cash</option>
                    <option value="card">Fuel Card</option>
                  </select>
                </Field>
              </div>
              {form.liters && form.pricePerLiter && (
                <div className="bg-blue-50 rounded-lg px-4 py-2 text-sm text-blue-700">
                  Total Cost: <strong>₹{Math.round(parseFloat(form.liters) * parseFloat(form.pricePerLiter)).toLocaleString('en-IN')}</strong>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
