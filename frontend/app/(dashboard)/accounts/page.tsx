'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';

interface EmiPayment { month: string; date: string; amount: number; }

interface Vehicle {
  id: string; regNumber: string; make: string; model: string; year: number;
  emiEnabled: string; monthlyEMI: number; loanBank: string;
  vehicleValue: number; loanAmount: number; loanTenureMonths: number;
  loanStartDate: string; emisPaid: number; emiHistory: EmiPayment[];
  status: string;
}

function fmtINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}
function fmtLakh(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return fmtINR(n);
}
function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function emiRemainingMonths(v: Vehicle) {
  return Math.max(0, (v.loanTenureMonths || 0) - (v.emisPaid || 0));
}
function emiRemainingBalance(v: Vehicle) {
  return emiRemainingMonths(v) * (v.monthlyEMI || 0);
}
function emiPaidPercent(v: Vehicle) {
  if (!v.loanTenureMonths) return 0;
  return Math.min(100, Math.round(((v.emisPaid || 0) / v.loanTenureMonths) * 100));
}
function emiCurrentMonthPaid(v: Vehicle) {
  return (v.emiHistory || []).some(h => h.month === currentMonthKey());
}
function totalPaid(v: Vehicle) {
  return (v.emisPaid || 0) * (v.monthlyEMI || 0);
}

export default function AccountsPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingEMI, setPayingEMI] = useState<Set<string>>(new Set());
  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange } = useDateRange();
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    (api.fleet() as Promise<Vehicle[]>).then(setVehicles).catch(console.error).finally(() => setLoading(false));
  }, []);

  function notify(msg: string, type: 'success' | 'error' = 'success') {
    setToast(msg); setToastType(type);
    setTimeout(() => setToast(''), 4000);
  }

  async function handlePayEMI(vehicleId: string) {
    setPayingEMI(prev => new Set(prev).add(vehicleId));
    try {
      const res = await api.payFleetEMI(vehicleId) as { vehicle: Vehicle };
      setVehicles(vs => vs.map(v => v.id === vehicleId ? res.vehicle : v));
      const v = res.vehicle;
      const remaining = emiRemainingMonths(v);
      notify(remaining === 0
        ? `EMI paid for ${v.regNumber} — Loan fully closed!`
        : `EMI paid for ${v.regNumber} — ${remaining} month${remaining === 1 ? '' : 's'} remaining`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed';
      notify(msg.includes('already') ? `This month's EMI is already recorded.` : msg, 'error');
    } finally {
      setPayingEMI(prev => { const n = new Set(prev); n.delete(vehicleId); return n; });
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  const emiVehicles = vehicles.filter(v => v.emiEnabled === 'Yes');
  const activeLoans = emiVehicles.filter(v => emiRemainingMonths(v) > 0);
  const closedLoans = emiVehicles.filter(v => emiRemainingMonths(v) === 0);

  const totalFleetValue = vehicles.reduce((s, v) => s + (v.vehicleValue || 0), 0);
  const totalOutstanding = activeLoans.reduce((s, v) => s + emiRemainingBalance(v), 0);
  const monthlyOutflow = activeLoans.reduce((s, v) => s + (v.monthlyEMI || 0), 0);

  const allPayments: (EmiPayment & { regNumber: string; vehicleId: string })[] = [];
  for (const v of emiVehicles) {
    for (const h of (v.emiHistory || [])) {
      if (inRange(h.date)) allPayments.push({ ...h, regNumber: v.regNumber, vehicleId: v.id });
    }
  }
  allPayments.sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-2 rounded-lg shadow-lg text-sm text-white ${toastType === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast}
        </div>
      )}

      <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} count={allPayments.length} total={emiVehicles.reduce((s, v) => s + (v.emiHistory || []).length, 0)} />

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Fleet Value', value: fmtLakh(totalFleetValue), color: 'text-slate-800', sub: `${vehicles.length} vehicles` },
          { label: 'Outstanding Loan Balance', value: fmtLakh(totalOutstanding), color: 'text-red-600', sub: `${activeLoans.length} active loan${activeLoans.length === 1 ? '' : 's'}` },
          { label: 'Monthly EMI Outflow', value: fmtLakh(monthlyOutflow), color: 'text-purple-700', sub: 'this month' },
          { label: 'Loans Closed', value: String(closedLoans.length), color: 'text-green-600', sub: `of ${emiVehicles.length} financed vehicles` },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Vehicle Finance Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Vehicle Finance Details</h3>
          <p className="text-xs text-slate-400 mt-0.5">Full loan and EMI breakdown per vehicle — unmasked for Accounts view</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Vehicle', 'Purchase Value', 'Bank', 'Loan Amount', 'Monthly EMI', 'EMIs Paid', 'Remaining', 'Balance', 'Progress', 'Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {vehicles.map(v => {
                const hasLoan = v.emiEnabled === 'Yes';
                const remaining = emiRemainingMonths(v);
                const loanDone = hasLoan && remaining === 0;
                const paid = hasLoan && emiCurrentMonthPaid(v);
                const isPaying = payingEMI.has(v.id);
                const pct = emiPaidPercent(v);
                return (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-mono text-sm font-medium text-slate-800">{v.regNumber}</div>
                      <div className="text-xs text-slate-500">{v.make} {v.model} · {v.year}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-800 whitespace-nowrap">
                      {fmtLakh(v.vehicleValue || 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {hasLoan ? v.loanBank : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                      {hasLoan ? fmtLakh(v.loanAmount || 0) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-purple-700 whitespace-nowrap">
                      {hasLoan ? fmtINR(v.monthlyEMI) : <span className="text-slate-300 font-normal">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                      {hasLoan ? (
                        <span>
                          {v.emisPaid || 0}
                          <span className="text-slate-400 text-xs"> / {v.loanTenureMonths}</span>
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {hasLoan ? (
                        loanDone ? (
                          <span className="text-green-600 font-medium">Closed ✓</span>
                        ) : (
                          <span className="text-slate-700">{remaining} mo</span>
                        )
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold whitespace-nowrap">
                      {hasLoan ? (
                        loanDone ? (
                          <span className="text-green-600">₹0</span>
                        ) : (
                          <span className="text-red-600">{fmtLakh(emiRemainingBalance(v))}</span>
                        )
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {hasLoan ? (
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <div className="h-2 w-20 bg-slate-100 rounded-full flex-shrink-0">
                            <div className={`h-2 rounded-full transition-all ${loanDone ? 'bg-green-500' : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{pct}%</span>
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {hasLoan && !loanDone ? (
                        <button
                          onClick={() => handlePayEMI(v.id)}
                          disabled={paid || isPaying}
                          title={paid ? `${currentMonthKey()} already paid` : `Submit EMI for ${currentMonthKey()}`}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                            paid ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60'
                          }`}>
                          {isPaying ? '…' : paid ? 'Paid ✓' : 'Pay EMI'}
                        </button>
                      ) : loanDone ? (
                        <span className="text-xs text-green-600 font-medium">Loan Closed</span>
                      ) : (
                        <span className="text-xs text-slate-300">No EMI</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total Paid Summary per vehicle */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Total EMI Paid — Cumulative</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {emiVehicles.map(v => (
            <div key={v.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <span className="font-mono text-sm font-medium text-slate-800">{v.regNumber}</span>
                <span className="text-xs text-slate-500 ml-2">{v.make} · {v.loanBank}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-slate-800">{fmtLakh(totalPaid(v))}</div>
                <div className="text-xs text-slate-400">{v.emisPaid} × {fmtINR(v.monthlyEMI)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* EMI Payment History */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">EMI Payment History</h3>
          <span className="text-xs text-slate-400">Payments recorded via this system</span>
        </div>
        {allPayments.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-10">
            No payments recorded yet — click &quot;Pay EMI&quot; to start tracking.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {allPayments.map((p, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm font-medium text-slate-800">{p.regNumber}</span>
                  <span className="ml-3 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-medium">{p.month}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-800">{fmtINR(p.amount)}</div>
                  <div className="text-xs text-slate-400">{p.date}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
