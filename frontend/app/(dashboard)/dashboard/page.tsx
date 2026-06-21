'use client';
import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { api } from '@/lib/api';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';

const MONTH_YYYYMM: Record<string, string> = {
  Jan: '2026-01', Feb: '2026-02', Mar: '2026-03',
  Apr: '2026-04', May: '2026-05', Jun: '2026-06',
  Jul: '2025-07', Aug: '2025-08', Sep: '2025-09',
  Oct: '2025-10', Nov: '2025-11', Dec: '2025-12',
};

interface DashboardData {
  totalVehicles: number;
  activeVehicles: number;
  activeTrips: number;
  totalRevenue: number;
  totalDrivers: number;
  unreadAlerts: number;
  fleetStatus: { running: number; idle: number; maintenance: number; breakdown: number };
  monthlyRevenue: { month: string; revenue: number; cost: number; trips: number }[];
  indentStats: { total: number; pending: number; approved: number; rejected: number };
}

function StatCard({ title, value, sub, icon, color }: { title: string; value: string | number; sub?: string; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
      </div>
    </div>
  );
}

const PIE_COLORS = ['#22c55e', '#f59e0b', '#3b82f6', '#ef4444'];

const UTILIZATION = [
  { label: 'V001 — MH-12-AB-1234', pct: 78, color: 'bg-green-500' },
  { label: 'V003 — GJ-01-EF-9012', pct: 88, color: 'bg-blue-500' },
  { label: 'V005 — KA-09-IJ-7890', pct: 92, color: 'bg-violet-500' },
  { label: 'V007 — RJ-14-MN-6789', pct: 74, color: 'bg-orange-500' },
  { label: 'V006 — TN-01-KL-2345', pct: 61, color: 'bg-yellow-500' },
  { label: 'V002 — MH-12-CD-5678', pct: 54, color: 'bg-slate-400' },
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo } = useDateRange();

  useEffect(() => {
    setMounted(true);
    api.dashboard()
      .then(setData)
      .catch(err => console.error('Dashboard API error:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  if (!data) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="text-slate-400 text-sm">Failed to load dashboard data.</div>
      <div className="text-xs text-slate-400">Make sure the backend is running on <span className="font-mono">http://localhost:5000</span></div>
      <button onClick={() => window.location.reload()} className="text-sm text-blue-600 hover:underline">Retry</button>
    </div>
  );

  const pieData = [
    { name: 'Running', value: data.fleetStatus.running },
    { name: 'Idle', value: data.fleetStatus.idle },
    { name: 'Maintenance', value: data.fleetStatus.maintenance },
    { name: 'Breakdown', value: data.fleetStatus.breakdown },
  ];

  const filteredMonthly = data.monthlyRevenue.filter(m => {
    const ym = MONTH_YYYYMM[m.month];
    return ym ? ym >= effectiveFrom && ym <= effectiveTo : false;
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Total Fleet" value={data.totalVehicles} sub="registered trucks"
          icon="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h9l2-2z" color="bg-slate-700" />
        <StatCard title="Active Trucks" value={data.activeVehicles} sub="on road now"
          icon="M13 10V3L4 14h7v7l9-11h-7z" color="bg-green-500" />
        <StatCard title="Active Trips" value={data.activeTrips} sub="in transit"
          icon="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4" color="bg-blue-500" />
        <StatCard title="Total Revenue" value={`₹${(data.totalRevenue / 100000).toFixed(1)}L`} sub="completed trips"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" color="bg-emerald-500" />
        <StatCard title="Drivers" value={data.totalDrivers} sub="total enrolled"
          icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" color="bg-violet-500" />
        <StatCard title="Alerts" value={data.unreadAlerts} sub="unread alerts"
          icon="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" color="bg-orange-500" />
      </div>

      {/* Fleet status summary (always visible, no charts) */}
      <div className="grid grid-cols-4 gap-3">
        {pieData.map((d, i) => (
          <div key={d.name} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i] }} />
            <div>
              <div className="text-xl font-bold text-slate-800">{d.value}</div>
              <div className="text-xs text-slate-500">{d.name}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Indent status summary */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Indent Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-400 flex-shrink-0" />
            <div>
              <div className="text-xl font-bold text-slate-800">{data.indentStats.total}</div>
              <div className="text-xs text-slate-500">Total Indents</div>
            </div>
          </div>
          <div className="rounded-lg border border-yellow-100 bg-yellow-50 p-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 flex-shrink-0" />
            <div>
              <div className="text-xl font-bold text-slate-800">{data.indentStats.pending}</div>
              <div className="text-xs text-slate-500">Pending Approval</div>
            </div>
          </div>
          <div className="rounded-lg border border-green-100 bg-green-50 p-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
            <div>
              <div className="text-xl font-bold text-slate-800">{data.indentStats.approved}</div>
              <div className="text-xs text-slate-500">Approved</div>
            </div>
          </div>
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
            <div>
              <div className="text-xl font-bold text-slate-800">{data.indentStats.rejected}</div>
              <div className="text-xs text-slate-500">Rejected</div>
            </div>
          </div>
        </div>
      </div>

      <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} />

      {/* Charts — only rendered after client mount */}
      {mounted && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue vs Cost */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-800">Revenue vs Cost</h3>
                <span className="text-xs text-slate-400">₹ INR</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={filteredMonthly}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, '']} />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#rev)" name="Revenue" strokeWidth={2} />
                  <Area type="monotone" dataKey="cost" stroke="#ef4444" fill="url(#cost)" name="Cost" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Fleet Status Pie */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Fleet Status</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trip Volume Bar */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Monthly Trip Volume</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="trips" fill="#6366f1" radius={[4, 4, 0, 0]} name="Trips" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Fleet Utilization */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Fleet Utilization</h3>
              <div className="space-y-3">
                {UTILIZATION.map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600">{item.label}</span>
                      <span className="font-medium text-slate-800">{item.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full">
                      <div className={`h-1.5 rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
