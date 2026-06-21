'use client';
import { useEffect, useState, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, Legend,
} from 'recharts';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────
interface Analytics {
  monthlyRevenue: { month: string; revenue: number; cost: number; trips: number }[];
  fuelTrend: { month: string; totalLiters: number; avgKmpl: number; cost: number }[];
  vehicleUtilization: { name: string; utilization: number }[];
  topDrivers: { name: string; score: number; trips: number }[];
}
interface Vehicle {
  id: string; regNumber: string; make: string; model: string; status: string;
  utilization: number; odometer: number; category: string; ownershipType: string;
  driver: string | null; capacity: string;
}
interface Trip {
  id: string; vehicleId: string; status: string; revenue: number;
  fuelCost: number; tollCost: number; actualKm: number; plannedKm: number;
  origin: string; destination: string; customer: string; plannedDate: string;
  actualDeparture: string | null; driverId: string;
  freight: number; loadingCharges: number; unloadingCharges: number; otherCharges: number;
}
interface FuelEntry {
  id: string; vehicleId: string; date: string; liters: number;
  totalCost: number; kmpl: number; station: string; tripId: string | null;
}
interface Maintenance {
  id: string; vehicleId: string; type: string; cost: number;
  status: string; date: string; description: string;
}
interface Driver {
  id: string; name: string; safetyScore: number; fuelScore: number;
  onTimeDelivery: number; totalTrips: number; assignedVehicle: string;
}

const INPUT  = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const SELECT = INPUT + " bg-white";

function fmtINR(n: number) { return '₹' + n.toLocaleString('en-IN'); }
function fmtK(n: number) {
  return n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` :
         n >= 1000   ? `₹${(n / 1000).toFixed(0)}K`   : `₹${n}`;
}

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename; a.click();
}

const STATUS_COLORS: Record<string, string> = {
  'Completed':        'bg-green-100 text-green-700',
  'In Transit':       'bg-blue-100 text-blue-700',
  'Planned':          'bg-purple-100 text-purple-700',
  'Delayed':          'bg-orange-100 text-orange-700',
  'Cancelled':        'bg-slate-100 text-slate-500',
  'Pending Approval': 'bg-yellow-100 text-yellow-700',
};

// Fleet-level analytics months map to real YYYY-MM values
const MONTH_YYYYMM: Record<string, string> = {
  Jan: '2026-01', Feb: '2026-02', Mar: '2026-03',
  Apr: '2026-04', May: '2026-05', Jun: '2026-06',
  Jul: '2025-07', Aug: '2025-08', Sep: '2025-09',
  Oct: '2025-10', Nov: '2025-11', Dec: '2025-12',
};

type Preset = '1m' | '3m' | '6m' | 'custom';

// Returns YYYY-MM n months before baseYM
function subtractMonths(baseYM: string, n: number): string {
  const [y, m] = baseYM.split('-').map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtYM(ym: string) {
  const [y, m] = ym.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(m) - 1]} ${y}`;
}

function KCard({ label, value, sub, color = 'text-slate-800', bg = '' }:
  { label: string; value: string | number; sub?: string; color?: string; bg?: string }) {
  return (
    <div className={`rounded-xl p-4 border shadow-sm ${bg || 'bg-white border-slate-100'}`}>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Date Range Bar ──────────────────────────────────────────────────────────
const TODAY_YM = '2026-05'; // last month with full data in mock dataset

function DateRangeBar({
  preset, setPreset, fromYM, setFromYM, toYM, setToYM,
}: {
  preset: Preset; setPreset: (p: Preset) => void;
  fromYM: string; setFromYM: (v: string) => void;
  toYM: string; setToYM: (v: string) => void;
}) {
  const presets: { key: Preset; label: string }[] = [
    { key: '1m', label: 'Last 1 Month' },
    { key: '3m', label: 'Last 3 Months' },
    { key: '6m', label: 'Last 6 Months' },
    { key: 'custom', label: 'Custom Range' },
  ];

  const effectiveFrom = preset === 'custom' ? fromYM : subtractMonths(TODAY_YM, preset === '1m' ? 0 : preset === '3m' ? 2 : 5);
  const effectiveTo   = preset === 'custom' ? toYM : TODAY_YM;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-4 flex-wrap">
      <span className="text-xs font-semibold text-slate-500 flex-shrink-0">Time Period</span>
      <div className="flex gap-1.5 flex-wrap">
        {presets.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${preset === p.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-slate-500">From</span>
          <input type="month" value={fromYM} onChange={e => setFromYM(e.target.value)}
            max={toYM}
            className="px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <span className="text-xs text-slate-400">to</span>
          <input type="month" value={toYM} onChange={e => setToYM(e.target.value)}
            min={fromYM} max={TODAY_YM}
            className="px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="font-medium text-slate-700">{fmtYM(effectiveFrom)}</span>
        <span>–</span>
        <span className="font-medium text-slate-700">{fmtYM(effectiveTo)}</span>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [analytics, setAnalytics]     = useState<Analytics | null>(null);
  const [vehicles, setVehicles]       = useState<Vehicle[]>([]);
  const [allTrips, setAllTrips]       = useState<Trip[]>([]);
  const [allFuel, setAllFuel]         = useState<FuelEntry[]>([]);
  const [allMaint, setAllMaint]       = useState<Maintenance[]>([]);
  const [allDrivers, setAllDrivers]   = useState<Driver[]>([]);
  const [loading, setLoading]         = useState(true);
  const [mounted, setMounted]         = useState(false);

  // Tabs
  const [tab, setTab]                       = useState<'fleet' | 'vehicle' | 'customer'>('fleet');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedCustomer, setSelectedCustomer]   = useState('');

  // Date range
  const [preset, setPreset]   = useState<Preset>('6m');
  const [fromYM, setFromYM]   = useState('2025-12');
  const [toYM, setToYM]       = useState('2026-05');

  // Schedule report modal
  const [showSchedule, setShowSchedule]   = useState(false);
  const [scheduleForm, setScheduleForm]   = useState({ email: '', frequency: 'Monthly', day: '1' });
  const [scheduleSuccess, setScheduleSuccess] = useState('');

  useEffect(() => {
    setMounted(true);
    Promise.all([
      api.analytics() as Promise<Analytics>,
      api.fleet()     as Promise<Vehicle[]>,
      api.trips()     as Promise<Trip[]>,
      api.fuel()      as Promise<FuelEntry[]>,
      api.maintenance() as Promise<Maintenance[]>,
      api.drivers()   as Promise<Driver[]>,
    ]).then(([a, v, t, f, m, d]) => {
      setAnalytics(a); setVehicles(v); setAllTrips(t);
      setAllFuel(f); setAllMaint(m); setAllDrivers(d);
      if (v.length) setSelectedVehicleId(v[0].id);
      const customers = [...new Set(t.map(x => x.customer))];
      if (customers.length) setSelectedCustomer(customers[0]);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // ── Effective date range ────────────────────────────────────────────────
  const effectiveFrom = useMemo(() =>
    preset === 'custom' ? fromYM : subtractMonths(TODAY_YM, preset === '1m' ? 0 : preset === '3m' ? 2 : 5),
    [preset, fromYM]);
  const effectiveTo = useMemo(() =>
    preset === 'custom' ? toYM : TODAY_YM,
    [preset, toYM]);

  function inRange(dateStr: string) {
    const ym = dateStr.slice(0, 7);
    return ym >= effectiveFrom && ym <= effectiveTo;
  }
  function monthInRange(monthName: string) {
    const ym = MONTH_YYYYMM[monthName];
    return ym ? ym >= effectiveFrom && ym <= effectiveTo : false;
  }

  // ── Fleet tab filtered data ─────────────────────────────────────────────
  const filteredMonthly = analytics?.monthlyRevenue.filter(m => monthInRange(m.month)) ?? [];
  const filteredFuelTrend = analytics?.fuelTrend.filter(m => monthInRange(m.month)) ?? [];
  const profitData = filteredMonthly.map(m => ({
    month: m.month,
    Profit: m.revenue - m.cost,
    Revenue: m.revenue,
    Cost: m.cost,
  }));

  // Fleet aggregate KPIs for selected range
  const fleetRevenue  = filteredMonthly.reduce((s, m) => s + m.revenue, 0);
  const fleetCost     = filteredMonthly.reduce((s, m) => s + m.cost, 0);
  const fleetProfit   = fleetRevenue - fleetCost;
  const fleetTrips    = filteredMonthly.reduce((s, m) => s + m.trips, 0);
  const fleetMargin   = fleetRevenue > 0 ? Math.round(fleetProfit / fleetRevenue * 100) : 0;

  // ── Vehicle tab filtered data ───────────────────────────────────────────
  const vTrips = allTrips.filter(t =>
    t.vehicleId === selectedVehicleId &&
    inRange(t.actualDeparture || t.plannedDate));
  const vFuel  = allFuel.filter(f => f.vehicleId === selectedVehicleId && inRange(f.date));
  const vMaint = allMaint.filter(m => m.vehicleId === selectedVehicleId && inRange(m.date));

  const selVehicle  = vehicles.find(v => v.id === selectedVehicleId);
  const vRevenue    = vTrips.reduce((s, t) => s + (t.revenue || 0), 0);
  const vFuelCost   = vFuel.reduce((s, f)  => s + f.totalCost, 0);
  const vTollCost   = vTrips.reduce((s, t) => s + (t.tollCost || 0), 0);
  const vMaintCost  = vMaint.reduce((s, m) => s + m.cost, 0);
  const vProfit     = vRevenue - vFuelCost - vTollCost - vMaintCost;
  const vMargin     = vRevenue > 0 ? Math.round(vProfit / vRevenue * 100) : 0;
  const vAvgKmpl    = vFuel.length ? (vFuel.reduce((s, f) => s + f.kmpl, 0) / vFuel.length).toFixed(1) : 'N/A';
  const vFuelLiters = vFuel.reduce((s, f) => s + f.liters, 0);
  const tripStatusCount = vTrips.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  const tripChartData = vTrips.filter(t => t.revenue > 0).map(t => ({
    name: t.id,
    route: `${t.origin.slice(0, 3)}→${t.destination.slice(0, 3)}`,
    Revenue: t.revenue, FuelCost: t.fuelCost || 0, TollCost: t.tollCost || 0,
    Profit: t.revenue - (t.fuelCost || 0) - (t.tollCost || 0),
  }));
  const fuelChartData = vFuel.slice().sort((a, b) => a.date.localeCompare(b.date)).map(f => ({
    date: f.date.slice(5), kmpl: f.kmpl, liters: f.liters, cost: f.totalCost, station: f.station,
  }));

  // ── Customer tab filtered data ──────────────────────────────────────────
  const customers = useMemo(() => [...new Set(allTrips.map(t => t.customer))].sort(), [allTrips]);
  const cTrips = allTrips.filter(t =>
    t.customer === selectedCustomer &&
    inRange(t.actualDeparture || t.plannedDate));
  const cRevenue   = cTrips.reduce((s, t) => s + (t.revenue || 0), 0);
  const cFuelCost  = cTrips.reduce((s, t) => s + (t.fuelCost || 0), 0);
  const cTollCost  = cTrips.reduce((s, t) => s + (t.tollCost || 0), 0);
  const cProfit    = cRevenue - cFuelCost - cTollCost;
  const cMargin    = cRevenue > 0 ? Math.round(cProfit / cRevenue * 100) : 0;
  const cTotalKm   = cTrips.reduce((s, t) => s + (t.actualKm || 0), 0);
  const cSegments  = [...new Set(cTrips.map(t => (t as unknown as { segment?: string }).segment || 'General'))];

  // Month-wise revenue for customer chart
  const cMonthlyData = useMemo(() => {
    const map: Record<string, { month: string; Revenue: number; Trips: number }> = {};
    cTrips.forEach(t => {
      const date = t.actualDeparture || t.plannedDate;
      if (!date) return;
      const ym = date.slice(0, 7);
      const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const label = `${names[parseInt(ym.split('-')[1]) - 1]} ${ym.split('-')[0]}`;
      if (!map[ym]) map[ym] = { month: label, Revenue: 0, Trips: 0 };
      map[ym].Revenue += t.revenue || 0;
      map[ym].Trips += 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [cTrips]);

  // All-customers comparison for selected period
  const customerSummary = useMemo(() => {
    const map: Record<string, { customer: string; trips: number; revenue: number; profit: number }> = {};
    allTrips.filter(t => inRange(t.actualDeparture || t.plannedDate)).forEach(t => {
      if (!map[t.customer]) map[t.customer] = { customer: t.customer, trips: 0, revenue: 0, profit: 0 };
      map[t.customer].trips   += 1;
      map[t.customer].revenue += t.revenue || 0;
      map[t.customer].profit  += (t.revenue || 0) - (t.fuelCost || 0) - (t.tollCost || 0);
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTrips, effectiveFrom, effectiveTo]);

  // ── Export helpers ──────────────────────────────────────────────────────
  function handleExportCSV() {
    downloadCSV('fleet_analytics.csv',
      filteredMonthly.map(m => [m.month, String(m.revenue), String(m.cost), String(m.revenue - m.cost), String(m.trips)]),
      ['Month', 'Revenue', 'Cost', 'Profit', 'Trips']);
  }
  function exportVehicleCSV() {
    downloadCSV(`vehicle_${selectedVehicleId}_${effectiveFrom}_${effectiveTo}.csv`,
      vTrips.map(t => [t.id, t.origin, t.destination, t.customer, t.status, String(t.revenue), String(t.fuelCost || 0), String(t.tollCost || 0), String(t.actualKm || 0)]),
      ['Trip ID', 'Origin', 'Destination', 'Customer', 'Status', 'Revenue', 'Fuel Cost', 'Toll Cost', 'KM']);
  }
  function exportCustomerCSV() {
    downloadCSV(`customer_${selectedCustomer.replace(/\s+/g, '_')}_${effectiveFrom}_${effectiveTo}.csv`,
      cTrips.map(t => [t.id, t.origin, t.destination, t.status, t.plannedDate, String(t.revenue), String(t.fuelCost || 0), String(t.tollCost || 0), String(t.actualKm || 0)]),
      ['Trip ID', 'Origin', 'Destination', 'Status', 'Date', 'Revenue', 'Fuel Cost', 'Toll Cost', 'KM']);
  }
  function handleExportPDF() {
    const win = window.open('', '_blank')!;
    win.document.write(`<html><head><title>TMS Analytics Report</title>
      <style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f1f5f9}h1,h2{color:#1e293b}</style></head><body>
      <h1>Analytics Report — ${fmtYM(effectiveFrom)} to ${fmtYM(effectiveTo)}</h1>
      <p>Generated: ${new Date().toLocaleString('en-IN')}</p>
      <h2>Monthly Financial Performance</h2>
      <table><thead><tr><th>Month</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Trips</th></tr></thead><tbody>
      ${filteredMonthly.map(m => `<tr><td>${m.month}</td><td>₹${m.revenue.toLocaleString()}</td><td>₹${m.cost.toLocaleString()}</td><td>₹${(m.revenue - m.cost).toLocaleString()}</td><td>${m.trips}</td></tr>`).join('')}
      </tbody></table></body></html>`);
    win.document.close(); win.print();
  }
  function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    setShowSchedule(false);
    setScheduleSuccess(`Report scheduled ${scheduleForm.frequency.toLowerCase()} to ${scheduleForm.email}`);
    setTimeout(() => setScheduleSuccess(''), 4000);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-4">
      {scheduleSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {scheduleSuccess}
        </div>
      )}

      {/* ── Top bar: tabs + export ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {([
            { key: 'fleet',    label: 'Fleet Overview' },
            { key: 'vehicle',  label: 'Vehicle Drill-down' },
            { key: 'customer', label: 'Customer Reports' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportPDF}
            className="text-sm text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            PDF
          </button>
          <button onClick={handleExportCSV}
            className="text-sm text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Excel
          </button>
          <button onClick={() => setShowSchedule(true)}
            className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Schedule Report
          </button>
        </div>
      </div>

      {/* ── Date range bar — always visible ── */}
      <DateRangeBar
        preset={preset} setPreset={setPreset}
        fromYM={fromYM} setFromYM={setFromYM}
        toYM={toYM} setToYM={setToYM}
      />

      {/* ═══════════════════════ FLEET TAB ═══════════════════════ */}
      {tab === 'fleet' && analytics && (<>
        {/* Fleet KPI summary cards */}
        <div className="grid grid-cols-5 gap-4">
          <KCard label="Total Revenue" value={fmtK(fleetRevenue)} color="text-green-700" bg="bg-green-50 border-green-100" />
          <KCard label="Total Cost" value={fmtK(fleetCost)} color="text-orange-600" bg="bg-orange-50 border-orange-100" />
          <KCard label="Net Profit" value={fmtK(fleetProfit)} color={fleetProfit >= 0 ? 'text-blue-700' : 'text-red-600'} bg="bg-blue-50 border-blue-100" />
          <KCard label="Profit Margin" value={`${fleetMargin}%`} color="text-purple-700" bg="bg-purple-50 border-purple-100" />
          <KCard label="Total Trips" value={fleetTrips} sub={`${filteredMonthly.length} month(s)`} />
        </div>

        {filteredMonthly.length === 0 ? (
          <div className="bg-white rounded-xl p-12 border border-slate-100 shadow-sm text-center text-slate-400 text-sm">
            No data found for the selected period.
          </div>
        ) : mounted && (<>
          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Monthly Profit</h3>
              <p className="text-xs text-slate-400 mb-4">Net profit by month</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={profitData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Profit']} />
                  <Bar dataKey="Profit" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Fleet Utilization by Vehicle</h3>
              <p className="text-xs text-slate-400 mb-4">% of available hours in use</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={analytics.vehicleUtilization} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(v) => [`${v}%`, 'Utilization']} />
                  <Bar dataKey="utilization" radius={[0, 4, 4, 0]} fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2 bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Revenue vs Cost Trend</h3>
              <p className="text-xs text-slate-400 mb-4">Financial performance for selected period</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={filteredMonthly}>
                  <defs>
                    <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
                  <Area type="monotone" dataKey="revenue" stroke="#22c55e" fill="url(#gr)" name="Revenue" strokeWidth={2} />
                  <Area type="monotone" dataKey="cost" stroke="#ef4444" fill="none" name="Cost" strokeWidth={2} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Top Driver Scoreboard</h3>
              <div className="space-y-3">
                {analytics.topDrivers.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-slate-100 text-slate-600' : 'bg-orange-50 text-orange-600'}`}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-700 truncate">{d.name}</div>
                      <div className="h-1.5 bg-slate-100 rounded-full mt-1"><div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${d.score}%` }} /></div>
                    </div>
                    <span className="text-xs font-bold text-slate-700">{d.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Fuel Efficiency Trend</h3>
            <p className="text-xs text-slate-400 mb-4">Fleet average km/L for selected period</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={filteredFuelTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                <Tooltip />
                <Line type="monotone" dataKey="avgKmpl" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} name="Avg KM/L" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>)}
      </>)}

      {/* ═══════════════════════ VEHICLE TAB ═══════════════════════ */}
      {tab === 'vehicle' && (<>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium text-slate-700 flex-shrink-0">Select Vehicle</label>
            <select value={selectedVehicleId} onChange={e => setSelectedVehicleId(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-72">
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.id} — {v.regNumber} ({v.make} {v.model})</option>
              ))}
            </select>
            {selVehicle && (<>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${selVehicle.status === 'Running' ? 'bg-green-100 text-green-700' : selVehicle.status === 'Idle' ? 'bg-slate-100 text-slate-600' : selVehicle.status === 'Maintenance' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{selVehicle.status}</span>
              <span className="text-xs text-slate-500">{selVehicle.category} · {selVehicle.capacity} · {selVehicle.ownershipType}</span>
            </>)}
            <button onClick={exportVehicleCSV}
              className="ml-auto px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <KCard label="Total Trips" value={vTrips.length} sub={`${tripStatusCount['Completed'] || 0} completed`} />
          <KCard label="Revenue" value={fmtK(vRevenue)} sub={`Margin ${vMargin}%`} color="text-green-700" bg="bg-green-50 border-green-100" />
          <KCard label="Fuel Cost" value={fmtK(vFuelCost)} sub={`${vFuelLiters.toLocaleString('en-IN')} L · Avg ${vAvgKmpl} km/L`} color="text-orange-600" bg="bg-orange-50 border-orange-100" />
          <KCard label="Net Profit" value={fmtK(vProfit)} sub={`Toll ${fmtK(vTollCost)} + Maint ${fmtK(vMaintCost)}`} color={vProfit >= 0 ? 'text-blue-700' : 'text-red-600'} bg="bg-blue-50 border-blue-100" />
        </div>

        {vTrips.length > 0 && (
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(tripStatusCount).map(([status, count]) => (
              <div key={status} className="bg-white rounded-lg border border-slate-100 px-3 py-2 flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-500'}`}>{status}</span>
                <span className="text-sm font-bold text-slate-700 ml-auto">{count}</span>
              </div>
            ))}
          </div>
        )}

        {vTrips.length === 0 && vFuel.length === 0 && vMaint.length === 0 ? (
          <div className="bg-white rounded-xl p-12 border border-slate-100 shadow-sm text-center text-slate-400 text-sm">
            No data for this vehicle in the selected period.
          </div>
        ) : mounted && (<>
          {tripChartData.length > 0 && (
            <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Trip-wise Revenue vs Cost</h3>
              <p className="text-xs text-slate-400 mb-4">Revenue, fuel cost, toll per trip in selected period</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={tripChartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="route" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v, name) => [`₹${Number(v).toLocaleString('en-IN')}`, name]} labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ''} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Revenue" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="FuelCost" fill="#f97316" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="TollCost" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {fuelChartData.length > 0 && (
            <div className="grid grid-cols-3 gap-5">
              <div className="col-span-2 bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-1">Fuel Fill-up Efficiency</h3>
                <p className="text-xs text-slate-400 mb-4">km/L at each fill-up in selected period</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={fuelChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                    <Tooltip formatter={(v, name) => [name === 'kmpl' ? `${v} km/L` : `${v} L`, name === 'kmpl' ? 'Efficiency' : 'Liters']} />
                    <Line type="monotone" dataKey="kmpl" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} name="kmpl" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Fill-up Log</h3>
                <div className="space-y-2">
                  {fuelChartData.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div><div className="font-medium text-slate-700">{f.date}</div><div className="text-slate-400 truncate max-w-[120px]">{f.station}</div></div>
                      <div className="text-right"><div className="font-semibold text-slate-800">{f.kmpl} km/L</div><div className="text-slate-400">{f.liters}L · ₹{f.cost.toLocaleString('en-IN')}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>)}

        {vTrips.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-800">Trip History</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50">
                  {['Trip ID','Route','Customer','Status','Date','KM','Revenue','Fuel','Toll','Profit'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {vTrips.map(t => {
                    const profit = t.revenue - (t.fuelCost || 0) - (t.tollCost || 0);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-700">{t.id}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-700">{t.origin} → {t.destination}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">{t.customer}</td>
                        <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>{t.status}</span></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{t.actualDeparture || t.plannedDate}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-700">{t.actualKm || '—'}</td>
                        <td className="px-4 py-2.5 text-xs font-medium text-green-700">{t.revenue ? fmtINR(t.revenue) : '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-orange-600">{t.fuelCost ? fmtINR(t.fuelCost) : '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-purple-600">{t.tollCost ? fmtINR(t.tollCost) : '—'}</td>
                        <td className={`px-4 py-2.5 text-xs font-semibold ${profit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{t.revenue ? fmtINR(profit) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-slate-700">Total</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-green-700">{fmtINR(vRevenue)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-orange-600">{fmtINR(vFuelCost)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-purple-600">{fmtINR(vTollCost)}</td>
                    <td className={`px-4 py-2.5 text-xs font-bold ${vProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmtINR(vProfit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {vMaint.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Maintenance History</h3>
              <span className="text-xs text-slate-500">Total: <strong className="text-red-600">{fmtINR(vMaintCost)}</strong></span>
            </div>
            <div className="divide-y divide-slate-50">
              {vMaint.map(m => (
                <div key={m.id} className="px-5 py-3 flex items-center gap-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${m.type === 'Breakdown' ? 'bg-red-100 text-red-700' : m.type === 'Preventive' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>{m.type}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-700">{m.description}</div>
                    <div className="text-xs text-slate-400">{m.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-red-600">{fmtINR(m.cost)}</div>
                    <span className={`text-xs ${m.status === 'Completed' ? 'text-green-600' : m.status === 'In Progress' ? 'text-blue-600' : 'text-yellow-600'}`}>{m.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}

      {/* ═══════════════════════ CUSTOMER TAB ═══════════════════════ */}
      {tab === 'customer' && (<>
        {/* Customer selector */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium text-slate-700 flex-shrink-0">Select Customer</label>
            <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-72">
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {cSegments.length > 0 && <span className="text-xs text-slate-500">{cSegments.join(' · ')}</span>}
            <button onClick={exportCustomerCSV}
              className="ml-auto px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export CSV
            </button>
          </div>
        </div>

        {/* Customer KPI cards */}
        <div className="grid grid-cols-4 gap-4">
          <KCard label="Total Trips" value={cTrips.length} sub={`${cTrips.filter(t => t.status === 'Completed').length} completed`} />
          <KCard label="Total Revenue" value={fmtK(cRevenue)} sub={`Margin ${cMargin}%`} color="text-green-700" bg="bg-green-50 border-green-100" />
          <KCard label="Net Profit" value={fmtK(cProfit)} sub={`Fuel ${fmtK(cFuelCost)} + Toll ${fmtK(cTollCost)}`} color={cProfit >= 0 ? 'text-blue-700' : 'text-red-600'} bg="bg-blue-50 border-blue-100" />
          <KCard label="Total KM" value={cTotalKm.toLocaleString('en-IN')} sub="actual km driven" />
        </div>

        {cTrips.length === 0 ? (
          <div className="bg-white rounded-xl p-12 border border-slate-100 shadow-sm text-center text-slate-400 text-sm">
            No trips for this customer in the selected period.
          </div>
        ) : mounted && (<>
          {/* Month-wise revenue chart for this customer */}
          {cMonthlyData.length > 1 && (
            <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Monthly Revenue — {selectedCustomer}</h3>
              <p className="text-xs text-slate-400 mb-4">Revenue contribution by month in selected period</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cMonthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
                  <Bar dataKey="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>)}

        {/* Customer trip table */}
        {cTrips.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-800">Trip History — {selectedCustomer}</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50">
                  {['Trip ID','Route','Vehicle','Status','Date','KM','Revenue','Fuel','Toll','Profit'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {cTrips.map(t => {
                    const profit = t.revenue - (t.fuelCost || 0) - (t.tollCost || 0);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-700">{t.id}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-700">{t.origin} → {t.destination}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">{t.vehicleId}</td>
                        <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>{t.status}</span></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{t.actualDeparture || t.plannedDate}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-700">{t.actualKm || '—'}</td>
                        <td className="px-4 py-2.5 text-xs font-medium text-green-700">{t.revenue ? fmtINR(t.revenue) : '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-orange-600">{t.fuelCost ? fmtINR(t.fuelCost) : '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-purple-600">{t.tollCost ? fmtINR(t.tollCost) : '—'}</td>
                        <td className={`px-4 py-2.5 text-xs font-semibold ${profit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{t.revenue ? fmtINR(profit) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-slate-700">Total</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-green-700">{fmtINR(cRevenue)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-orange-600">{fmtINR(cFuelCost)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-purple-600">{fmtINR(cTollCost)}</td>
                    <td className={`px-4 py-2.5 text-xs font-bold ${cProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmtINR(cProfit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* All-customers leaderboard for selected period */}
        {customerSummary.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">All Customers — Period Summary</h3>
              <p className="text-xs text-slate-400 mt-0.5">{fmtYM(effectiveFrom)} to {fmtYM(effectiveTo)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50">
                  {['Rank','Customer','Trips','Revenue','Profit','Margin'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {customerSummary.map((c, i) => {
                    const margin = c.revenue > 0 ? Math.round(c.profit / c.revenue * 100) : 0;
                    return (
                      <tr key={c.customer} className={`hover:bg-slate-50 ${selectedCustomer === c.customer ? 'bg-blue-50' : ''}`}
                        onClick={() => setSelectedCustomer(c.customer)} style={{ cursor: 'pointer' }}>
                        <td className="px-4 py-2.5 text-xs font-bold text-slate-500">#{i + 1}</td>
                        <td className="px-4 py-2.5 text-xs font-medium text-slate-800">{c.customer}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">{c.trips}</td>
                        <td className="px-4 py-2.5 text-xs font-medium text-green-700">{fmtINR(c.revenue)}</td>
                        <td className={`px-4 py-2.5 text-xs font-semibold ${c.profit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmtINR(c.profit)}</td>
                        <td className="px-4 py-2.5 text-xs">
                          <span className={`px-2 py-0.5 rounded-full font-medium ${margin >= 50 ? 'bg-green-100 text-green-700' : margin >= 30 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{margin}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-5 py-2 text-xs text-slate-400">Click a row to see that customer's detail above.</div>
            </div>
          </div>
        )}
      </>)}

      {/* Schedule Modal */}
      {showSchedule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Schedule Report</h3>
              <button onClick={() => setShowSchedule(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSchedule} className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-lg px-4 py-2 text-xs text-slate-600">
                Period: <strong>{fmtYM(effectiveFrom)}</strong> to <strong>{fmtYM(effectiveTo)}</strong> · Tab: <strong className="capitalize">{tab}</strong>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Recipient Email *</label>
                <input required type="email" value={scheduleForm.email}
                  onChange={e => setScheduleForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="admin@company.com" className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
                <select value={scheduleForm.frequency}
                  onChange={e => setScheduleForm(f => ({ ...f, frequency: e.target.value }))} className={SELECT}>
                  <option>Daily</option><option>Weekly</option><option>Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Send on Day</label>
                <input type="number" min={1} max={28} value={scheduleForm.day}
                  onChange={e => setScheduleForm(f => ({ ...f, day: e.target.value }))} placeholder="1" className={INPUT} />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowSchedule(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
