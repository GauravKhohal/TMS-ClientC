'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { api } from '@/lib/api';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';

interface CostingData {
  costings: {
    tripId: string; fuel: number; toll: number; driver: number; maintenance: number;
    tyre: number; misc: number; totalCost: number; revenue: number; profit: number;
    margin: number; kmCost: number;
  }[];
  summary: { totalRevenue: number; totalCost: number; totalProfit: number; avgMargin: number };
}

interface TripRef { id: string; vehicleId: string; driverId: string; plannedDate: string }

function fmt(v: unknown) { return `₹${Number(v).toLocaleString('en-IN')}`; }

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function CostingPage() {
  const router = useRouter();
  const [data, setData] = useState<CostingData | null>(null);
  const [tripRefs, setTripRefs] = useState<Record<string, TripRef>>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  // inline toll edit: key = tripId, value = string being edited
  const [editingToll, setEditingToll] = useState<Record<string, string>>({});
  const [savingToll, setSavingToll] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange } = useDateRange();

  useEffect(() => {
    setMounted(true);
    Promise.all([api.costing(), api.trips()])
      .then(([costingRes, tripsRes]: [CostingData, TripRef[]]) => {
        setData(costingRes);
        const refs: Record<string, TripRef> = {};
        for (const t of tripsRes || []) refs[t.id] = { id: t.id, vehicleId: t.vehicleId, driverId: t.driverId, plannedDate: t.plannedDate || '' };
        setTripRefs(refs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  function goTrip(tripId: string) { router.push(`/trips?search=${tripId}`); }
  function goFuel(tripId: string) { router.push(`/fuel?trip=${tripId}`); }
  function goDriver(tripId: string) { const ref = tripRefs[tripId]; router.push(ref?.driverId ? `/drivers?search=${ref.driverId}` : '/drivers'); }
  function goMaintenance(tripId: string) { const ref = tripRefs[tripId]; router.push(ref?.vehicleId ? `/maintenance?search=${ref.vehicleId}` : '/maintenance'); }
  function goTyre(tripId: string) { const ref = tripRefs[tripId]; router.push(ref?.vehicleId ? `/tyres?search=${ref.vehicleId}` : '/tyres'); }
  function goPettyCash(tripId: string) { router.push(`/petty-cash?search=${tripId}`); }

  async function saveToll(tripId: string) {
    const val = parseFloat(editingToll[tripId]);
    if (isNaN(val) || val < 0) return;
    setSavingToll(tripId);
    try {
      await api.updateTripToll(tripId, val);
      setData(prev => {
        if (!prev) return prev;
        const updated = prev.costings.map(c => {
          if (c.tripId !== tripId) return c;
          const totalCost = c.fuel + val + c.driver + c.maintenance + c.tyre + c.misc;
          const profit = c.revenue - totalCost;
          return { ...c, toll: val, totalCost, profit, margin: Math.round(profit / c.revenue * 100) };
        });
        const totalRevenue = updated.reduce((s, c) => s + c.revenue, 0);
        const totalCost    = updated.reduce((s, c) => s + c.totalCost, 0);
        const totalProfit  = totalRevenue - totalCost;
        return { costings: updated, summary: { totalRevenue, totalCost, totalProfit, avgMargin: Math.round(totalProfit / totalRevenue * 100) } };
      });
      setEditingToll(prev => { const n = { ...prev }; delete n[tripId]; return n; });
      showToast(`Toll updated for ${tripId}`);
    } catch { showToast('Failed to update toll'); }
    finally { setSavingToll(null); }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;
  if (!data) return null;

  const { summary: rawSummary, costings: allCostings } = data;
  const costings = allCostings.filter(c => inRange(tripRefs[c.tripId]?.plannedDate));
  const summary = costings.length === allCostings.length ? rawSummary : {
    totalRevenue: costings.reduce((s, c) => s + c.revenue, 0),
    totalCost:    costings.reduce((s, c) => s + c.totalCost, 0),
    totalProfit:  costings.reduce((s, c) => s + c.profit, 0),
    avgMargin:    costings.length ? Math.round(costings.reduce((s, c) => s + c.margin, 0) / costings.length) : 0,
  };

  const costBreakdown = costings.reduce((acc, c) => {
    acc.fuel += c.fuel; acc.toll += c.toll; acc.driver += c.driver;
    acc.maintenance += c.maintenance; acc.tyre += c.tyre; acc.misc += c.misc;
    return acc;
  }, { fuel: 0, toll: 0, driver: 0, maintenance: 0, tyre: 0, misc: 0 });

  const pieData = [
    { name: 'Fuel', value: costBreakdown.fuel },
    { name: 'Driver', value: costBreakdown.driver },
    { name: 'Toll', value: costBreakdown.toll },
    { name: 'Maintenance', value: costBreakdown.maintenance },
    { name: 'Tyre', value: costBreakdown.tyre },
    { name: 'Misc', value: costBreakdown.misc },
  ];
  const PIE_COLORS = ['#f59e0b', '#6366f1', '#ef4444', '#3b82f6', '#10b981', '#94a3b8'];

  const barData = costings.map(c => ({
    trip: c.tripId,
    Revenue: c.revenue,
    Cost: c.totalCost,
    Profit: c.profit,
  }));

  function handleExportCSV() {
    const headers = ['Trip', 'Revenue', 'Fuel', 'Toll', 'Driver', 'Maintenance', 'Tyre', 'Misc', 'Total Cost', 'Profit', 'Margin%', 'Cost/KM'];
    const rows = costings.map(c => [
      c.tripId, String(c.revenue), String(c.fuel), String(c.toll), String(c.driver),
      String(c.maintenance), String(c.tyre), String(c.misc), String(c.totalCost),
      String(c.profit), String(c.margin), String(c.kmCost),
    ]);
    downloadCSV('tms_costing_report.csv', rows, headers);
  }

  function handleExportPDF() {
    const win = window.open('', '_blank')!;
    win.document.write(`<html><head><title>TMS Costing Report</title>
      <style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f1f5f9}h1{color:#1e293b}</style></head><body>
      <h1>Trip-wise P&L Statement</h1>
      <p>Generated: ${new Date().toLocaleString('en-IN')}</p>
      <table><thead><tr><th>Trip</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th></tr></thead><tbody>
      ${costings.map(c => `<tr><td>${c.tripId}</td><td>₹${c.revenue.toLocaleString()}</td><td>₹${c.totalCost.toLocaleString()}</td><td>₹${c.profit.toLocaleString()}</td><td>${c.margin}%</td></tr>`).join('')}
      </tbody></table></body></html>`);
    win.document.close();
    win.print();
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>
      )}
      <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} count={costings.length} total={allCostings.length} />

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: `₹${(summary.totalRevenue / 100000).toFixed(2)}L`, color: 'text-green-600' },
          { label: 'Total Cost', value: `₹${(summary.totalCost / 100000).toFixed(2)}L`, color: 'text-red-500' },
          { label: 'Total Profit', value: `₹${(summary.totalProfit / 100000).toFixed(2)}L`, color: 'text-blue-600' },
          { label: 'Avg Margin', value: `${summary.avgMargin}%`, color: 'text-violet-600' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-slate-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {mounted && <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Trip-wise Revenue vs Cost vs Profit</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="trip" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={fmt} />
              <Bar dataKey="Revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Cost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Profit" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Cost Breakdown by Category</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value">
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={fmt} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>}

      {/* Trip P&L Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Trip-wise P&L Statement</h3>
          <div className="flex gap-2">
            <button onClick={handleExportPDF}
              className="text-sm text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              Export PDF
            </button>
            <button onClick={handleExportCSV}
              className="text-sm text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export Excel
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Trip', 'Revenue', 'Fuel', 'Toll', 'Driver', 'Maintenance', 'Tyre', 'Misc', 'Total Cost', 'Profit', 'Margin', 'Cost/KM'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {h === 'Toll' ? (
                      <span className="flex items-center gap-1">
                        Toll
                        <span className="text-blue-400 font-normal normal-case tracking-normal" title="Click value to view reconciliation · Hover for edit pencil">↗ ✎</span>
                      </span>
                    ) : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {costings.map(c => (
                <tr key={c.tripId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-sm font-medium">
                    <button onClick={() => goTrip(c.tripId)} className="text-slate-700 hover:text-blue-700 hover:underline" title="View trip details">
                      {c.tripId}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold">
                    <button onClick={() => goTrip(c.tripId)} className="text-green-600 hover:text-green-800 hover:underline" title="View trip details">
                      ₹{c.revenue.toLocaleString('en-IN')}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => goFuel(c.tripId)} className="text-slate-600 hover:text-blue-700 hover:underline" title="View fuel entries for this trip">
                      ₹{c.fuel.toLocaleString()}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {editingToll[c.tripId] !== undefined ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min={0}
                          value={editingToll[c.tripId]}
                          onChange={e => setEditingToll(prev => ({ ...prev, [c.tripId]: e.target.value }))}
                          className="w-24 px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={() => saveToll(c.tripId)}
                          disabled={savingToll === c.tripId}
                          className="text-green-600 hover:text-green-800 text-xs font-semibold disabled:opacity-50"
                        >
                          {savingToll === c.tripId ? '…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingToll(prev => { const n = { ...prev }; delete n[c.tripId]; return n; })} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group">
                        <button
                          onClick={() => router.push(`/toll?trip=${c.tripId}`)}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                          title="View toll reconciliation for this trip"
                        >
                          ₹{c.toll.toLocaleString()}
                        </button>
                        <button
                          onClick={() => setEditingToll(prev => ({ ...prev, [c.tripId]: String(c.toll) }))}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-opacity"
                          title="Update actual toll"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => goDriver(c.tripId)} className="text-slate-600 hover:text-blue-700 hover:underline" title="View driver details">
                      ₹{c.driver.toLocaleString()}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => goMaintenance(c.tripId)} className="text-slate-600 hover:text-blue-700 hover:underline" title="View maintenance records for this vehicle">
                      ₹{c.maintenance.toLocaleString()}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => goTyre(c.tripId)} className="text-slate-600 hover:text-blue-700 hover:underline" title="View tyre records for this vehicle">
                      ₹{c.tyre.toLocaleString()}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => goPettyCash(c.tripId)} className="text-slate-600 hover:text-blue-700 hover:underline" title="View trip advance entries for this trip">
                      ₹{c.misc.toLocaleString()}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold">
                    <button onClick={() => goTrip(c.tripId)} className="text-orange-600 hover:text-orange-800 hover:underline" title="View trip details">
                      ₹{c.totalCost.toLocaleString('en-IN')}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm font-bold">
                    <button onClick={() => goTrip(c.tripId)} className="text-blue-600 hover:text-blue-800 hover:underline" title="View trip details">
                      ₹{c.profit.toLocaleString('en-IN')}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => goTrip(c.tripId)} title="View trip details">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium hover:underline ${c.margin >= 50 ? 'bg-green-100 text-green-700' : c.margin >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {c.margin}%
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => goTrip(c.tripId)} className="text-slate-600 hover:text-blue-700 hover:underline" title="View trip details">
                      ₹{c.kmCost}/km
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
