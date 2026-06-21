'use client';
import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';

interface EmiPayment { month: string; date: string; amount: number; }

interface Vehicle {
  id: string; regNumber: string; make: string; model: string; year: number;
  category: string; ownershipType: string; capacity: string; fuelType: string;
  status: string; driver: string | null; odometer: number; speed: number;
  utilization: number; insurance: string; fitness: string; permit: string;
  lastService?: string;
  location: { lat: number; lng: number };
  purchaseDate?: string;
  purchasedAgency: string;
  vehicleValue: number;
  emiEnabled: string;
  monthlyEMI: number;
  loanBank: string;
  loanAmount: number;
  loanTenureMonths: number;
  loanStartDate: string;
  emisPaid: number;
  emiHistory: EmiPayment[];
}

const MAX_FLEET_SIZE = 200;

const EMPTY_FORM = {
  regNumber: '', make: '', model: '', year: new Date().getFullYear(),
  category: 'Heavy', ownershipType: 'Own', capacity: '', fuelType: 'Diesel',
  insurance: '', fitness: '', permit: '', odometer: 0,
  purchaseDate: '', purchasedAgency: '', vehicleValue: 0,
  emiEnabled: 'No', monthlyEMI: 0, loanBank: '',
  loanAmount: 0, loanTenureMonths: 60, loanStartDate: '',
};

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function emiRemainingMonths(v: Vehicle): number {
  return Math.max(0, (v.loanTenureMonths || 0) - (v.emisPaid || 0));
}

function emiRemainingBalance(v: Vehicle): number {
  return emiRemainingMonths(v) * (v.monthlyEMI || 0);
}

function emiPaidPercent(v: Vehicle): number {
  if (!v.loanTenureMonths) return 0;
  return Math.min(100, Math.round(((v.emisPaid || 0) / v.loanTenureMonths) * 100));
}

function emiCurrentMonthPaid(v: Vehicle): boolean {
  const mk = currentMonthKey();
  return (v.emiHistory || []).some(h => h.month === mk);
}

function fmtLakh(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Running: 'bg-green-100 text-green-700',
    Idle: 'bg-yellow-100 text-yellow-700',
    Maintenance: 'bg-blue-100 text-blue-700',
    Breakdown: 'bg-red-100 text-red-700',
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-slate-100 text-slate-700'}`}>{status}</span>;
}

function MaskedAmount({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-mono">
      <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      {label}
    </span>
  );
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

const INPUT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const SELECT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

const EXCEL_COLS = [
  'Reg Number', 'Make', 'Model', 'Year', 'Category', 'Ownership Type',
  'Capacity', 'Fuel Type', 'Odometer (km)', 'Insurance Expiry', 'Fitness Expiry',
  'Permit Expiry', 'Purchased Agency', 'Vehicle Value (₹)', 'EMI', 'Monthly EMI (₹)', 'Bank Name',
];

function vehiclesToSheet(data: Vehicle[]) {
  return data.map(v => ({
    'Reg Number': v.regNumber, 'Make': v.make, 'Model': v.model, 'Year': v.year,
    'Category': v.category, 'Ownership Type': v.ownershipType, 'Capacity': v.capacity,
    'Fuel Type': v.fuelType, 'Odometer (km)': v.odometer,
    'Insurance Expiry': v.insurance, 'Fitness Expiry': v.fitness, 'Permit Expiry': v.permit,
    'Purchased Agency': v.purchasedAgency, 'Purchase Date': v.purchaseDate || '', 'Vehicle Value (₹)': v.vehicleValue,
    'EMI': v.emiEnabled, 'Monthly EMI (₹)': v.monthlyEMI, 'Bank Name': v.loanBank,
    'Status': v.status, 'Utilization (%)': v.utilization,
  }));
}

function downloadExcel(data: Vehicle[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(vehiclesToSheet(data));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fleet');
  XLSX.writeFile(wb, filename);
}

function downloadTemplate() {
  const template = [EXCEL_COLS.reduce((acc, col) => ({ ...acc, [col]: '' }), {})];
  (template[0] as Record<string, string | number>)['Reg Number'] = 'MH-12-AB-1234';
  (template[0] as Record<string, string | number>)['Make'] = 'Tata';
  (template[0] as Record<string, string | number>)['Model'] = 'Prima 4028.S';
  (template[0] as Record<string, string | number>)['Year'] = 2021;
  (template[0] as Record<string, string | number>)['Category'] = 'Heavy';
  (template[0] as Record<string, string | number>)['Ownership Type'] = 'Own';
  (template[0] as Record<string, string | number>)['Capacity'] = '25 Ton';
  (template[0] as Record<string, string | number>)['Fuel Type'] = 'Diesel';
  (template[0] as Record<string, string | number>)['Odometer (km)'] = 145230;
  (template[0] as Record<string, string | number>)['Insurance Expiry'] = '2027-01-10';
  (template[0] as Record<string, string | number>)['Fitness Expiry'] = '2026-11-20';
  (template[0] as Record<string, string | number>)['Permit Expiry'] = '2026-09-30';
  (template[0] as Record<string, string | number>)['Purchased Agency'] = 'Tata Motors Pune';
  (template[0] as Record<string, string | number>)['Vehicle Value (₹)'] = 2800000;
  (template[0] as Record<string, string | number>)['EMI'] = 'Yes';
  (template[0] as Record<string, string | number>)['Monthly EMI (₹)'] = 52000;
  (template[0] as Record<string, string | number>)['Bank Name'] = 'HDFC Bank';
  const ws = XLSX.utils.json_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'fleet_upload_template.xlsx');
}

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange } = useDateRange();
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [payingEMI, setPayingEMI] = useState<Set<string>>(new Set());
  const fleetFull = vehicles.length >= MAX_FLEET_SIZE;
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.fleet().then(setVehicles).catch(console.error).finally(() => setLoading(false));
  }, []);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      if (vehicles.length >= MAX_FLEET_SIZE) {
        setErrorMsg(`Fleet limit of ${MAX_FLEET_SIZE} trucks reached. Remove a vehicle before importing more.`);
        setTimeout(() => setErrorMsg(''), 4000);
        e.target.value = '';
        return;
      }
      const wb = XLSX.read(evt.target?.result, { type: 'array' });
      const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<string, string | number>[];
      const rows = allRows.slice(0, MAX_FLEET_SIZE - vehicles.length);
      const skipped = allRows.length - rows.length;

      const imported: Vehicle[] = [];
      let failed = 0;
      for (const row of rows) {
        const payload = {
          regNumber: String(row['Reg Number'] || ''),
          make: String(row['Make'] || ''),
          model: String(row['Model'] || ''),
          year: Number(row['Year']) || new Date().getFullYear(),
          category: String(row['Category'] || 'Heavy'),
          ownershipType: String(row['Ownership Type'] || 'Own'),
          capacity: String(row['Capacity'] || ''),
          fuelType: String(row['Fuel Type'] || 'Diesel'),
          odometer: Number(row['Odometer (km)']) || 0,
          insurance: String(row['Insurance Expiry'] || ''),
          fitness: String(row['Fitness Expiry'] || ''),
          permit: String(row['Permit Expiry'] || ''),
          purchasedAgency: String(row['Purchased Agency'] || ''),
          vehicleValue: Number(row['Vehicle Value (₹)']) || 0,
          emiEnabled: String(row['EMI'] || 'No'),
          monthlyEMI: Number(row['Monthly EMI (₹)']) || 0,
          loanBank: String(row['Bank Name'] || ''),
        };
        if (!payload.regNumber || !payload.make || !payload.model) { failed++; continue; }
        try {
          imported.push(await api.createVehicle(payload) as Vehicle);
        } catch { failed++; }
      }

      setVehicles(v => [...imported, ...v]);
      if (imported.length > 0) {
        setSuccessMsg(`${imported.length} vehicle(s) imported successfully!`);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
      if (skipped > 0 || failed > 0) {
        const parts = [];
        if (skipped > 0) parts.push(`${skipped} row(s) skipped (fleet limit of ${MAX_FLEET_SIZE} reached)`);
        if (failed > 0) parts.push(`${failed} row(s) failed to save`);
        setErrorMsg(parts.join('; '));
        setTimeout(() => setErrorMsg(''), 5000);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  const dateFiltered = vehicles.filter(v => inRange(v.purchaseDate));
  const baseVehicles = dateFiltered.length > 0 ? dateFiltered : vehicles;

  const filtered = baseVehicles.filter(v => {
    const matchSearch = v.regNumber.toLowerCase().includes(search.toLowerCase()) || v.make.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'All' || v.status === filter;
    return matchSearch && matchFilter;
  });

  const counts = {
    All: baseVehicles.length,
    Running: baseVehicles.filter(v => v.status === 'Running').length,
    Idle: baseVehicles.filter(v => v.status === 'Idle').length,
    Maintenance: baseVehicles.filter(v => v.status === 'Maintenance').length,
    Breakdown: baseVehicles.filter(v => v.status === 'Breakdown').length,
  };

  function set(field: string, value: string | number) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handlePayEMI(vehicleId: string) {
    setPayingEMI(prev => new Set(prev).add(vehicleId));
    try {
      const res = await api.payFleetEMI(vehicleId) as { vehicle: Vehicle };
      setVehicles(vs => vs.map(v => v.id === vehicleId ? res.vehicle : v));
      const v = res.vehicle;
      const remaining = emiRemainingMonths(v);
      setSuccessMsg(remaining === 0
        ? `EMI paid for ${v.regNumber} — Loan fully closed!`
        : `EMI paid for ${v.regNumber} — ${remaining} month${remaining === 1 ? '' : 's'} remaining`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record EMI payment';
      setErrorMsg(msg.includes('already') ? `This month's EMI is already recorded for this vehicle.` : msg);
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setPayingEMI(prev => { const n = new Set(prev); n.delete(vehicleId); return n; });
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (fleetFull) {
      setErrorMsg(`Fleet limit of ${MAX_FLEET_SIZE} trucks reached. Remove a vehicle before adding a new one.`);
      setTimeout(() => setErrorMsg(''), 4000);
      return;
    }
    setSaving(true);
    try {
      const newVehicle = await api.createVehicle(form) as Vehicle;
      setVehicles(v => [newVehicle, ...v]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      setSuccessMsg(`Vehicle ${form.regNumber} added successfully!`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add vehicle');
      setTimeout(() => setErrorMsg(''), 4000);
    }
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-5">
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {errorMsg}
        </div>
      )}
      {fleetFull && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Fleet limit of {MAX_FLEET_SIZE} trucks reached ({vehicles.length}/{MAX_FLEET_SIZE}). Remove a vehicle to add a new one.
        </div>
      )}

      <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} count={dateFiltered.length} total={vehicles.length} />

      {/* Status tabs */}
      <div className="grid grid-cols-5 gap-3">
        {Object.entries(counts).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`bg-white rounded-xl p-4 border text-left transition-all ${filter === k ? 'border-blue-500 shadow-md' : 'border-slate-100 hover:border-slate-300'}`}>
            <div className="text-xl font-bold text-slate-800">{v}</div>
            <div className="text-xs text-slate-500 mt-0.5">{k}</div>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Hidden file input for upload */}
            <input ref={uploadRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
            {/* Download Template */}
            <button onClick={downloadTemplate}
              className="px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Template
            </button>
            {/* Upload Excel */}
            <button onClick={() => uploadRef.current?.click()} disabled={fleetFull}
              title={fleetFull ? `Fleet limit of ${MAX_FLEET_SIZE} trucks reached` : undefined}
              className="px-3 py-2 text-sm text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Upload Excel
            </button>
            {/* Download Excel */}
            <button onClick={() => downloadExcel(filtered, 'fleet_data.xlsx')}
              className="px-3 py-2 text-sm text-blue-700 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download Excel
            </button>
            {/* Add Vehicle */}
            <button onClick={() => setShowAdd(true)} disabled={fleetFull}
              title={fleetFull ? `Fleet limit of ${MAX_FLEET_SIZE} trucks reached` : undefined}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Vehicle
            </button>
          </div>
          <input type="text" placeholder="Search by reg. no. or make..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 ml-auto" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Reg. Number', 'Make / Model', 'Category', 'Capacity', 'Utilization', 'Purchased Agency', 'Value', 'EMI', 'Insurance', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(v => {
                const insuranceDays = v.insurance ? daysUntil(v.insurance) : null;
                return (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm font-medium text-slate-800 whitespace-nowrap">{v.regNumber}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-800">{v.make}</div>
                      <div className="text-xs text-slate-500">{v.model} · {v.year}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{v.category}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{v.capacity}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-100 rounded-full">
                          <div className={`h-1.5 rounded-full ${v.utilization >= 80 ? 'bg-green-500' : v.utilization >= 60 ? 'bg-yellow-500' : 'bg-red-400'}`} style={{ width: `${v.utilization}%` }} />
                        </div>
                        <span className="text-xs text-slate-600">{v.utilization}%</span>
                      </div>
                    </td>
                    {/* Purchased Agency */}
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{v.purchasedAgency || '—'}</td>
                    {/* Vehicle Value — masked */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <MaskedAmount label="₹ ••,••,•••" />
                    </td>
                    {/* EMI */}
                    <td className="px-4 py-3">
                      {v.emiEnabled === 'Yes' ? (() => {
                        const remaining = emiRemainingMonths(v);
                        const pct = emiPaidPercent(v);
                        const paid = emiCurrentMonthPaid(v);
                        const isPaying = payingEMI.has(v.id);
                        const loanDone = remaining === 0;
                        return (
                          <div className="space-y-1 min-w-[160px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${loanDone ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                                {loanDone ? '✓ Loan Closed' : 'EMI'}
                              </span>
                              {!loanDone && (
                                <button
                                  onClick={() => handlePayEMI(v.id)}
                                  disabled={paid || isPaying}
                                  title={paid ? `${currentMonthKey()} already paid` : `Submit EMI for ${currentMonthKey()}`}
                                  className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${paid ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60'}`}>
                                  {isPaying ? '…' : paid ? 'Paid ✓' : 'Pay EMI'}
                                </button>
                              )}
                            </div>
                            {!loanDone && (
                              <>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full">
                                  <div className="h-1.5 rounded-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} />
                                </div>
                                <div className="text-xs text-slate-500">
                                  {remaining} mo left · {fmtLakh(emiRemainingBalance(v))}
                                </div>
                              </>
                            )}
                            <div className="text-xs text-slate-400">{v.loanBank}</div>
                          </div>
                        );
                      })() : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">No EMI</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {insuranceDays !== null ? (
                        <span className={`text-xs font-medium ${insuranceDays < 90 ? 'text-orange-600' : 'text-slate-600'}`}>
                          {insuranceDays < 0 ? 'Expired' : `${insuranceDays}d left`}
                        </span>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelected(v)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Details</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center text-slate-400 text-sm py-10">No vehicles match your search.</div>
          )}
        </div>
      </div>

      {/* ── Add Vehicle Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Add New Vehicle</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-5">
              {/* Registration & Identity */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Vehicle Identity</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Registration Number *">
                    <input required value={form.regNumber} onChange={e => set('regNumber', e.target.value)}
                      placeholder="MH-12-AB-1234" className={INPUT} />
                  </Field>
                  <Field label="Make (Brand) *">
                    <input required value={form.make} onChange={e => set('make', e.target.value)}
                      placeholder="Tata, Ashok Leyland..." className={INPUT} />
                  </Field>
                  <Field label="Model *">
                    <input required value={form.model} onChange={e => set('model', e.target.value)}
                      placeholder="Prima 4028.S" className={INPUT} />
                  </Field>
                  <Field label="Year of Manufacture *">
                    <input required type="number" min={2000} max={2030} value={form.year}
                      onChange={e => set('year', parseInt(e.target.value))} className={INPUT} />
                  </Field>
                </div>
              </div>

              {/* Specs */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Specifications</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Category *">
                    <select required value={form.category} onChange={e => set('category', e.target.value)} className={SELECT}>
                      {['Light', 'Medium', 'Heavy', 'Super Heavy'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Ownership Type *">
                    <select required value={form.ownershipType} onChange={e => set('ownershipType', e.target.value)} className={SELECT}>
                      {['Own', 'Leased', 'Contract'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Payload Capacity *">
                    <input required value={form.capacity} onChange={e => set('capacity', e.target.value)}
                      placeholder="25 Ton" className={INPUT} />
                  </Field>
                  <Field label="Fuel Type *">
                    <select required value={form.fuelType} onChange={e => set('fuelType', e.target.value)} className={SELECT}>
                      {['Diesel', 'Petrol', 'CNG', 'Electric', 'LNG'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Current Odometer (km)">
                    <input type="number" min={0} value={form.odometer}
                      onChange={e => set('odometer', parseInt(e.target.value))} className={INPUT} />
                  </Field>
                </div>
              </div>

              {/* Purchase & Finance */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Purchase &amp; Finance</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Purchased Agency / Dealer *">
                    <input required value={form.purchasedAgency} onChange={e => set('purchasedAgency', e.target.value)}
                      placeholder="Tata Motors Pune" className={INPUT} />
                  </Field>
                  <Field label="Purchase Date *">
                    <input required type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Vehicle Value (₹) *">
                    <input required type="number" min={0} value={form.vehicleValue || ''}
                      onChange={e => set('vehicleValue', parseInt(e.target.value) || 0)}
                      placeholder="2800000" className={INPUT} />
                  </Field>
                  <Field label="EMI *">
                    <select required value={form.emiEnabled} onChange={e => set('emiEnabled', e.target.value)} className={SELECT}>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </Field>
                  {form.emiEnabled === 'Yes' && (
                    <>
                      <Field label="Monthly EMI Amount (₹) *">
                        <input required type="number" min={0} value={form.monthlyEMI || ''}
                          onChange={e => set('monthlyEMI', parseInt(e.target.value) || 0)}
                          placeholder="52000" className={INPUT} />
                      </Field>
                      <Field label="Bank Name *">
                        <input required value={form.loanBank} onChange={e => set('loanBank', e.target.value)}
                          placeholder="HDFC Bank" className={INPUT} />
                      </Field>
                      <Field label="Total Loan Amount (₹) *">
                        <input required type="number" min={0} value={form.loanAmount || ''}
                          onChange={e => set('loanAmount', parseInt(e.target.value) || 0)}
                          placeholder="2200000" className={INPUT} />
                      </Field>
                      <Field label="Loan Tenure (months) *">
                        <input required type="number" min={1} max={120} value={form.loanTenureMonths || ''}
                          onChange={e => set('loanTenureMonths', parseInt(e.target.value) || 60)}
                          placeholder="60" className={INPUT} />
                      </Field>
                      <Field label="EMI Start Date *">
                        <input required type="date" value={form.loanStartDate}
                          onChange={e => set('loanStartDate', e.target.value)} className={INPUT} />
                      </Field>
                    </>
                  )}
                </div>
              </div>

              {/* Documents */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Document Expiry Dates</p>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Insurance Expiry *">
                    <input required type="date" value={form.insurance} onChange={e => set('insurance', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Fitness Certificate Expiry *">
                    <input required type="date" value={form.fitness} onChange={e => set('fitness', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Permit Expiry *">
                    <input required type="date" value={form.permit} onChange={e => set('permit', e.target.value)} className={INPUT} />
                  </Field>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Saving...' : 'Add Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-800">{selected.regNumber}</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                ['Make', selected.make], ['Model', selected.model], ['Year', selected.year],
                ['Category', selected.category], ['Ownership', selected.ownershipType], ['Capacity', selected.capacity],
                ['Fuel Type', selected.fuelType], ['Status', selected.status],
                ['Odometer', `${selected.odometer.toLocaleString()} km`],
                ['Speed', selected.speed > 0 ? `${selected.speed} km/h` : 'Stationary'],
                ['Insurance Expiry', selected.insurance || '—'],
                ['Fitness Expiry', selected.fitness || '—'],
                ['Permit Expiry', selected.permit || '—'],
                ['Utilization', `${selected.utilization}%`],
                ['Purchased Agency', selected.purchasedAgency || '—'],
                ['Purchase Date', selected.purchaseDate || '—'],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <div className="text-xs text-slate-500">{k}</div>
                  <div className="font-medium text-slate-800">{v}</div>
                </div>
              ))}
              {/* Masked financial fields */}
              <div>
                <div className="text-xs text-slate-500">Vehicle Value</div>
                <MaskedAmount label="₹ ••,••,••• (visible in Accounts)" />
              </div>
              <div>
                <div className="text-xs text-slate-500">EMI</div>
                {selected.emiEnabled === 'Yes' ? (
                  <div className="space-y-0.5">
                    <div className="font-medium text-slate-800">Yes — {selected.loanBank}</div>
                    <MaskedAmount label="₹ ••,••• /month (visible in Accounts)" />
                  </div>
                ) : (
                  <div className="font-medium text-slate-800">No EMI</div>
                )}
              </div>
            </div>
            {selected.location && (
              <div className="mt-5 p-3 bg-slate-50 rounded-lg">
                <div className="text-xs text-slate-500 mb-1">GPS Location</div>
                <div className="font-mono text-sm text-slate-700">Lat: {selected.location.lat.toFixed(4)}, Lng: {selected.location.lng.toFixed(4)}</div>
              </div>
            )}
            <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <div className="text-xs text-amber-700 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                Financial details (vehicle value &amp; EMI) are visible in the <strong className="ml-0.5">Accounts</strong> section.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
