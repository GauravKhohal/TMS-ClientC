'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import CityInput, { type CityResult } from '@/components/CityInput';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';
type CityHit = CityResult;

// ── Types ─────────────────────────────────────────────────────────────────────

interface TollCharges {
  car: number; lcv: number; hcv2: number; hcv3: number; multiAxle: number; oversized: number;
}
interface Plaza {
  id: string; name: string; location: string; km: number; charges: TollCharges;
}
interface TollRoute {
  id: string; origin: string; destination: string; highway: string; distance: number; plazas: Plaza[];
}
interface PlazaEntry {
  plazaName: string; planned: number; fasttag: number; cash: number;
  status: 'Matched' | 'Disputed' | 'Cash' | 'Missing';
  note?: string;
}
interface Reconciliation {
  id: string; tripId: string; vehicleId: string; routeId: string;
  route: string; highway: string; distance: number;
  vehicleCategory: string;
  plannedToll: number; fasttagAmount: number; cashAmount: number;
  totalActual: number; variance: number; varianceType: string;
  status: string; date: string;
  plazaEntries: PlazaEntry[];
  notes: string;
}
interface ReconSummary {
  totalPlanned: number; totalActual: number; totalFastTag: number;
  totalCash: number; totalVariance: number; pending: number;
}
interface FastagAccount {
  vehicleId: string; regNumber: string; fastagId: string; bank: string;
  balance: number; status: string; lastTransaction: string;
}
interface FastagTxn {
  txnId: string; vehicleId: string; regNumber: string; bank: string;
  plaza: string; highway: string; amount: number; timestamp: string;
  tripId: string | null; matched: boolean;
}
interface FastagSettings { bank: string; apiKey: string; clientId: string; configured: boolean; }

// ── Constants ─────────────────────────────────────────────────────────────────

const INPUT  = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const SELECT = INPUT + ' bg-white';

const CATEGORIES: { key: keyof TollCharges; label: string }[] = [
  { key: 'car',       label: 'Car / Jeep / Van' },
  { key: 'lcv',       label: 'LCV (≤ 7.5 T)' },
  { key: 'hcv2',      label: '2-Axle Truck / Bus' },
  { key: 'hcv3',      label: '3-Axle HCV (most fleet trucks)' },
  { key: 'multiAxle', label: 'Multi-Axle (4–6 Axle)' },
  { key: 'oversized', label: 'Over-Sized Vehicle' },
];

const CAT_LABEL: Record<string, string> = {
  car: 'Car/Van', lcv: 'LCV', hcv2: '2-Axle', hcv3: '3-Axle HCV', multiAxle: 'Multi-Axle', oversized: 'Over-Sized',
};

const STATUS_COLORS: Record<string, string> = {
  Reconciled:     'bg-green-100 text-green-700',
  'Under Review': 'bg-orange-100 text-orange-700',
  'Pending Review':'bg-yellow-100 text-yellow-700',
  Pending:        'bg-slate-100 text-slate-500',
  Disputed:       'bg-red-100 text-red-700',
};

const PLAZA_STATUS_COLORS: Record<string, string> = {
  Matched:  'bg-green-100 text-green-700',
  Disputed: 'bg-red-100 text-red-700',
  Cash:     'bg-blue-100 text-blue-700',
  Missing:  'bg-orange-100 text-orange-700',
};

const VARIANCE_COLORS: Record<string, string> = {
  Matched:           'text-green-600',
  'Excess Charged':  'text-red-600',
  'Under-reported':  'text-orange-600',
  'Missing Deduction':'text-orange-600',
  'Not Started':     'text-slate-400',
};

const RATE_PER_KM: Record<string, number> = {
  car: 1.2, lcv: 2.0, hcv2: 3.5, hcv3: 4.5, multiAxle: 5.5, oversized: 7.0,
};

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN');
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TollPage() {
  return <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}><TollPageInner /></Suspense>;
}

function TollPageInner() {
  const searchParams = useSearchParams();
  const tripParam = searchParams.get('trip'); // e.g. "T001" from costing page link
  const [routes, setRoutes]       = useState<TollRoute[]>([]);
  const [recons, setRecons]       = useState<Reconciliation[]>([]);
  const [summary, setSummary]     = useState<ReconSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<'calculator' | 'reconciliation' | 'monthly' | 'fasttag'>(tripParam ? 'reconciliation' : 'calculator');

  // FASTag state
  const [fastagAccounts, setFastagAccounts]   = useState<FastagAccount[]>([]);
  const [fastagTxns, setFastagTxns]           = useState<FastagTxn[]>([]);
  const [fastagSummary, setFastagSummary]     = useState<{ totalBalance: number; lowBalance: number; inactive: number; totalAccounts: number } | null>(null);
  const [fastagSettings, setFastagSettings]   = useState<FastagSettings>({ bank: '', apiKey: '', clientId: '', configured: false });
  const [lastSyncedAt, setLastSyncedAt]       = useState<string | null>(null);
  const [fastagSyncing, setFastagSyncing]     = useState(false);
  const [fastagSavingSettings, setFastagSavingSettings] = useState(false);
  const [settingsForm, setSettingsForm]       = useState({ bank: '', apiKey: '', clientId: '' });
  const [showSettings, setShowSettings]       = useState(false);
  const [txnFilter, setTxnFilter]             = useState<'all' | 'matched' | 'unmatched'>('all');
  const [linkingTxn, setLinkingTxn]           = useState<FastagTxn | null>(null);
  const [linkTripId, setLinkTripId]           = useState('');
  const [fastagModal, setFastagModal]         = useState<{ mode: 'add' | 'edit'; vehicleId?: string } | null>(null);
  const [fastagForm, setFastagForm]           = useState({ vehicleId: '', fastagId: '', bank: '', balance: '' });
  const [fastagFormSaving, setFastagFormSaving] = useState(false);

  // Calculator state
  const [selRoute,    setSelRoute]   = useState('');
  const [selCat,      setSelCat]     = useState<keyof TollCharges>('hcv3');
  const [roundTrip,   setRoundTrip]  = useState(false);

  // Reconciliation state
  const [statusFilter, setStatusFilter] = useState('All');
  const [detailRec,    setDetailRec]    = useState<Reconciliation | null>(null);
  const [toast,        setToast]        = useState('');
  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange } = useDateRange();

  // Custom route calculator
  const [calcMode,        setCalcMode]        = useState<'predefined' | 'custom'>('predefined');
  const [customOrigin,    setCustomOrigin]    = useState('');
  const [customDest,      setCustomDest]      = useState('');
  const [customDistance,  setCustomDistance]  = useState('');
  const [distLoading,     setDistLoading]     = useState(false);
  const [distError,       setDistError]       = useState('');
  const [resolvedFrom,    setResolvedFrom]    = useState('');
  const [resolvedTo,      setResolvedTo]      = useState('');
  // City autocomplete — client-side, instant, no API calls
  const [selectedFrom,    setSelectedFrom]    = useState<CityHit | null>(null);
  const [selectedTo,      setSelectedTo]      = useState<CityHit | null>(null);


  // Add reconciliation modal
  const [showAddRecon,    setShowAddRecon]    = useState(false);
  const [addReconSaving,  setAddReconSaving]  = useState(false);
  const [addReconForm,    setAddReconForm]    = useState({
    origin: '', destination: '', highway: '', distance: '',
    tripId: '', vehicleId: '', vehicleCategory: 'hcv3' as keyof TollCharges,
    date: new Date().toISOString().split('T')[0],
    plannedToll: '', fasttagAmount: '', cashAmount: '', notes: '',
  });

  useEffect(() => {
    Promise.all([api.tollRoutes(), api.tollReconciliation(), api.fastagAccounts(), api.fastagTransactions()])
      .then(([r, rec, ft, txns]) => {
        setRoutes(r);
        setRecons(rec.reconciliations);
        setSummary(rec.summary);
        if (r.length) setSelRoute(r[0].id);
        if (tripParam) {
          const found = rec.reconciliations.find((x: Reconciliation) => x.tripId === tripParam);
          if (found) setDetailRec(found);
        }
        setFastagAccounts(ft.accounts);
        setFastagSummary(ft.summary);
        setFastagSettings(ft.settings);
        setSettingsForm({ bank: ft.settings.bank, apiKey: ft.settings.apiKey, clientId: ft.settings.clientId });
        setLastSyncedAt(ft.lastSyncedAt);
        setFastagTxns(txns.transactions);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tripParam]);

  async function handleFastagSync() {
    setFastagSyncing(true);
    try {
      const res = await api.fastagSync();
      setLastSyncedAt(res.lastSyncedAt);
      const txns = await api.fastagTransactions();
      setFastagTxns(txns.transactions);
      setToast(`Sync complete — ${res.message}`);
      setTimeout(() => setToast(''), 4000);
    } catch { setToast('Sync failed — check API settings'); setTimeout(() => setToast(''), 3000); }
    setFastagSyncing(false);
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setFastagSavingSettings(true);
    try {
      const res = await api.fastagSaveSettings(settingsForm);
      setFastagSettings(res.settings);
      setShowSettings(false);
      setToast('FASTag settings saved');
      setTimeout(() => setToast(''), 3000);
    } catch { setToast('Failed to save settings'); setTimeout(() => setToast(''), 3000); }
    setFastagSavingSettings(false);
  }

  async function handleLinkTrip() {
    if (!linkingTxn || !linkTripId.trim()) return;
    try {
      await api.fastagLinkTrip(linkingTxn.txnId, linkTripId.trim());
      setFastagTxns(prev => prev.map(t => t.txnId === linkingTxn.txnId ? { ...t, tripId: linkTripId.trim(), matched: true } : t));
      setLinkingTxn(null); setLinkTripId('');
      setToast(`Transaction linked to ${linkTripId.trim()}`);
      setTimeout(() => setToast(''), 3000);
    } catch { setToast('Link failed'); setTimeout(() => setToast(''), 3000); }
  }

  function openAddFastag(vehicleId = '') {
    setFastagForm({ vehicleId, fastagId: '', bank: '', balance: '' });
    setFastagModal({ mode: 'add' });
  }
  function openEditFastag(acct: FastagAccount) {
    setFastagForm({ vehicleId: acct.vehicleId, fastagId: acct.fastagId, bank: acct.bank, balance: String(acct.balance) });
    setFastagModal({ mode: 'edit', vehicleId: acct.vehicleId });
  }

  async function handleFastagFormSave(e: React.FormEvent) {
    e.preventDefault();
    setFastagFormSaving(true);
    try {
      if (fastagModal?.mode === 'add') {
        const res = await api.fastagAddAccount({ vehicleId: fastagForm.vehicleId, fastagId: fastagForm.fastagId, bank: fastagForm.bank });
        setFastagAccounts(prev => {
          const exists = prev.findIndex(a => a.vehicleId === res.account.vehicleId);
          return exists >= 0 ? prev.map((a, i) => i === exists ? res.account : a) : [...prev, res.account];
        });
        setToast(`FASTag account added for ${fastagForm.vehicleId}`);
      } else {
        const res = await api.fastagEditAccount(fastagModal!.vehicleId!, { fastagId: fastagForm.fastagId, bank: fastagForm.bank, balance: Number(fastagForm.balance) || undefined });
        setFastagAccounts(prev => prev.map(a => a.vehicleId === fastagModal!.vehicleId ? res.account : a));
        setToast('FASTag account updated');
      }
      setFastagModal(null);
      setTimeout(() => setToast(''), 3000);
    } catch { setToast('Save failed'); setTimeout(() => setToast(''), 3000); }
    setFastagFormSaving(false);
  }

  // (suggestions are now synchronous via useMemo — no async effects needed)

  // ── Distance: fires when both cities are locked in ────────────────────────
  useEffect(() => {
    if (!selectedFrom || !selectedTo) return;
    setDistLoading(true);
    setDistError('');
    setCustomDistance('');
    setResolvedFrom('');
    setResolvedTo('');
    api.calcDistance(
      selectedFrom.lat, selectedFrom.lng,
      selectedTo.lat,   selectedTo.lng,
      selectedFrom.name, selectedTo.name,
    )
      .then(r => { setCustomDistance(String(r.distanceKm)); setResolvedFrom(r.from); setResolvedTo(r.to); })
      .catch((err: Error) => setDistError('Error: ' + (err?.message || 'Unknown. Check if you are logged in.')))
      .finally(() => setDistLoading(false));
  }, [selectedFrom, selectedTo]);

  function pickFrom(c: CityHit) {
    setSelectedFrom(c);
    setCustomOrigin(c.name);
  }
  function pickTo(c: CityHit) {
    setSelectedTo(c);
    setCustomDest(c.name);
  }
  function clearFrom() {
    setCustomOrigin(''); setSelectedFrom(null);
    setCustomDistance(''); setResolvedFrom(''); setResolvedTo(''); setDistError('');
  }
  function clearTo() {
    setCustomDest(''); setSelectedTo(null);
    setCustomDistance(''); setResolvedFrom(''); setResolvedTo(''); setDistError('');
  }

  // ── Calculator logic ──────────────────────────────────────────────────────

  const activeRoute = routes.find(r => r.id === selRoute);
  const calcTotal   = activeRoute
    ? activeRoute.plazas.reduce((s, p) => s + p.charges[selCat], 0) * (roundTrip ? 2 : 1)
    : 0;

  const customDist          = parseFloat(customDistance) || 0;
  const customTollEstimate  = customDist > 0
    ? Math.round(customDist * (RATE_PER_KM[selCat] ?? 4.5) * (roundTrip ? 2 : 1))
    : 0;

  // ── Filtered reconciliations ──────────────────────────────────────────────

  const dateFiltered = recons.filter(r => inRange(r.date));
  const filtered = statusFilter === 'All'
    ? dateFiltered
    : dateFiltered.filter(r => r.status === statusFilter);

  const STATUS_FILTERS = ['All', 'Reconciled', 'Pending Review', 'Under Review', 'Pending'];
  const counts = STATUS_FILTERS.reduce((acc, s) => {
    acc[s] = s === 'All' ? dateFiltered.length : dateFiltered.filter(r => r.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  // ── Mark reconciled ───────────────────────────────────────────────────────

  function markReconciled(id: string) {
    setRecons(prev => prev.map(r => r.id === id ? { ...r, status: 'Reconciled' } : r));
    setDetailRec(prev => prev && prev.id === id ? { ...prev, status: 'Reconciled' } : prev);
    setToast('Marked as reconciled');
    setTimeout(() => setToast(''), 3000);
  }

  function setArf(field: string, value: string) {
    setAddReconForm(f => ({ ...f, [field]: value }));
  }

  function handleAddRecon(e: React.SyntheticEvent) {
    e.preventDefault();
    setAddReconSaving(true);
    setTimeout(() => {
      const fasttag  = parseFloat(addReconForm.fasttagAmount) || 0;
      const cash     = parseFloat(addReconForm.cashAmount)    || 0;
      const planned  = parseFloat(addReconForm.plannedToll)   || 0;
      const actual   = fasttag + cash;
      const variance = actual - planned;
      const varianceType = variance === 0 ? 'Matched' : variance > 0 ? 'Excess Charged' : 'Under-reported';
      const status   = actual === 0 ? 'Pending' : variance === 0 ? 'Reconciled' : 'Pending Review';
      const newRec: Reconciliation = {
        id:              'RC' + String(recons.length + 1).padStart(3, '0'),
        tripId:          addReconForm.tripId || 'CUSTOM',
        vehicleId:       addReconForm.vehicleId,
        routeId:         'custom',
        route:           `${addReconForm.origin} → ${addReconForm.destination}`,
        highway:         addReconForm.highway || 'NH',
        distance:        parseFloat(addReconForm.distance) || 0,
        vehicleCategory: addReconForm.vehicleCategory,
        plannedToll:     planned,
        fasttagAmount:   fasttag,
        cashAmount:      cash,
        totalActual:     actual,
        variance,
        varianceType,
        status,
        date:            addReconForm.date,
        plazaEntries:    [],
        notes:           addReconForm.notes,
      };
      setRecons(prev => [newRec, ...prev]);
      setShowAddRecon(false);
      setAddReconSaving(false);
      setAddReconForm({
        origin: '', destination: '', highway: '', distance: '',
        tripId: '', vehicleId: '', vehicleCategory: 'hcv3',
        date: new Date().toISOString().split('T')[0],
        plannedToll: '', fasttagAmount: '', cashAmount: '', notes: '',
      });
      setToast('Reconciliation entry added');
      setTimeout(() => setToast(''), 3000);
    }, 600);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Toll Tax Reconciliation</h1>
          <p className="text-sm text-slate-500 mt-0.5">Calculate route-wise toll costs and reconcile FASTag vs planned charges</p>
        </div>
        <button
          onClick={() => {
            const rows = dateFiltered.map(r =>
              [r.tripId, r.route, r.highway, CAT_LABEL[r.vehicleCategory], r.plannedToll, r.fasttagAmount, r.cashAmount, r.totalActual, r.variance, r.status].join(',')
            );
            const csv = ['Trip ID,Route,Highway,Vehicle Category,Planned (₹),FASTag (₹),Cash (₹),Actual (₹),Variance (₹),Status', ...rows].join('\n');
            const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
            a.download = 'toll_reconciliation.csv'; a.click();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700"
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Planned',  val: fmt(summary.totalPlanned),  color: 'text-slate-800' },
            { label: 'FASTag Deducted',val: fmt(summary.totalFastTag),   color: 'text-blue-600'  },
            { label: 'Cash Paid',      val: fmt(summary.totalCash),      color: 'text-amber-600' },
            { label: 'Total Actual',   val: fmt(summary.totalActual),    color: 'text-slate-800' },
            { label: 'Total Variance', val: (summary.totalVariance >= 0 ? '+' : '') + fmt(summary.totalVariance), color: summary.totalVariance > 0 ? 'text-red-600' : summary.totalVariance < 0 ? 'text-orange-600' : 'text-green-600' },
            { label: 'Pending Recon',  val: String(summary.pending),     color: 'text-orange-600' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <div className={`text-xl font-bold ${c.color}`}>{c.val}</div>
              <div className="text-xs text-slate-500 mt-1">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {([
          ['calculator',     '🧮 Toll Calculator'],
          ['reconciliation', '📋 Trip Reconciliation'],
          ['monthly',        '📊 Vehicle Monthly'],
          ['fasttag',        '🏦 FASTag Live'],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: CALCULATOR ─────────────────────────────────────────────────── */}
      {tab === 'calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Controls */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="font-semibold text-slate-700">Route Settings</h2>

            {/* Mode toggle */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setCalcMode('predefined')}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${calcMode === 'predefined' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Predefined Routes
              </button>
              <button
                onClick={() => setCalcMode('custom')}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${calcMode === 'custom' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Custom Route
              </button>
            </div>

            {calcMode === 'predefined' ? (
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Select Route</label>
                <select className={SELECT} value={selRoute} onChange={e => setSelRoute(e.target.value)}>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>{r.origin} → {r.destination} ({r.highway})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                {/* From City */}
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">From City</label>
                  <CityInput value={customOrigin}
                    placeholder="e.g. Mumbai, Barmer, any town…"
                    onChange={v => { setCustomOrigin(v); setSelectedFrom(null); setCustomDistance(''); setResolvedFrom(''); setResolvedTo(''); setDistError(''); }}
                    onSelect={c => pickFrom(c)} />
                </div>

                {/* To City */}
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">To City</label>
                  <CityInput value={customDest}
                    placeholder="e.g. Delhi, Silchar, any town…"
                    onChange={v => { setCustomDest(v); setSelectedTo(null); setCustomDistance(''); setResolvedFrom(''); setResolvedTo(''); setDistError(''); }}
                    onSelect={c => pickTo(c)} />
                </div>

                {/* Distance — auto filled */}
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Distance (km)
                    {distLoading && <span className="ml-2 w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block align-middle" />}
                  </label>
                  <input
                    className={INPUT} type="number" min={0}
                    placeholder={selectedFrom && selectedTo ? 'Calculating…' : 'Auto-filled after selecting both cities'}
                    value={customDistance}
                    onChange={e => { setCustomDistance(e.target.value); setDistError(''); }}
                  />
                  {resolvedFrom && resolvedTo && !distError && (
                    <p className="text-xs text-green-600 mt-1">✓ {resolvedFrom} → {resolvedTo}</p>
                  )}
                  {distError && <p className="text-xs text-red-500 mt-1">{distError}</p>}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Vehicle Category</label>
              <select className={SELECT} value={selCat} onChange={e => setSelCat(e.target.value as keyof TollCharges)}>
                {CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <button
                onClick={() => setRoundTrip(false)}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${!roundTrip ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-200'}`}
              >
                One Way
              </button>
              <button
                onClick={() => setRoundTrip(true)}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${roundTrip ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-200'}`}
              >
                Round Trip
              </button>
            </div>

            {/* Summary — predefined */}
            {calcMode === 'predefined' && activeRoute && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Highway</span>
                  <span className="font-medium text-slate-700">{activeRoute.highway}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Distance</span>
                  <span className="font-medium text-slate-700">{roundTrip ? activeRoute.distance * 2 : activeRoute.distance} km</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Toll Plazas</span>
                  <span className="font-medium text-slate-700">{activeRoute.plazas.length} × {roundTrip ? '2' : '1'} = {activeRoute.plazas.length * (roundTrip ? 2 : 1)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-100 pt-2 mt-2">
                  <span className="font-semibold text-slate-700">Estimated Total Toll</span>
                  <span className="font-bold text-blue-600 text-base">{fmt(calcTotal)}</span>
                </div>
                {roundTrip && (
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>One-way</span>
                    <span>{fmt(calcTotal / 2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Summary — custom */}
            {calcMode === 'custom' && customDist > 0 && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Distance</span>
                  <span className="font-medium text-slate-700">{roundTrip ? customDist * 2 : customDist} km</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Rate applied</span>
                  <span className="font-medium text-slate-700">₹{RATE_PER_KM[selCat] ?? 4.5}/km</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-100 pt-2 mt-2">
                  <span className="font-semibold text-slate-700">Estimated Toll</span>
                  <span className="font-bold text-blue-600 text-base">{fmt(customTollEstimate)}</span>
                </div>
                {roundTrip && (
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>One-way</span>
                    <span>{fmt(customTollEstimate / 2)}</span>
                  </div>
                )}
                <p className="text-xs text-slate-400 pt-1">Based on NHAI per-km rates. Actual toll depends on plaza count on this corridor.</p>
              </div>
            )}
          </div>

          {/* Plaza Table */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                {calcMode === 'predefined' ? (
                  <>
                    <h2 className="font-semibold text-slate-700">
                      {activeRoute ? `${activeRoute.origin} → ${activeRoute.destination}` : 'Select a route'}
                      {roundTrip && activeRoute && ` → ${activeRoute.origin}`}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {activeRoute ? `${activeRoute.highway} · ${activeRoute.plazas.length} toll plazas` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="font-semibold text-slate-700">
                      {customOrigin && customDest ? `${customOrigin} → ${customDest}${roundTrip ? ` → ${customOrigin}` : ''}` : 'Enter cities above'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Custom route — estimated from per-km NHAI rates</p>
                  </>
                )}
              </div>
              {calcMode === 'predefined' && activeRoute && (
                <span className="text-sm font-bold text-blue-600">{fmt(calcTotal)} total</span>
              )}
              {calcMode === 'custom' && customTollEstimate > 0 && (
                <span className="text-sm font-bold text-blue-600">{fmt(customTollEstimate)} est.</span>
              )}
            </div>

            {calcMode === 'predefined' ? (
              activeRoute ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">#</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Toll Plaza</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Location</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">KM</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Charge</th>
                        {roundTrip && <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Return</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {activeRoute.plazas.map((p, i) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{p.location}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{p.km}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(p.charges[selCat])}</td>
                          {roundTrip && <td className="px-4 py-3 text-right text-blue-500">{fmt(p.charges[selCat])}</td>}
                        </tr>
                      ))}
                      <tr className="bg-blue-50 font-semibold">
                        <td colSpan={4} className="px-4 py-3 text-slate-700">Total Toll ({roundTrip ? 'Round Trip' : 'One Way'})</td>
                        <td className="px-4 py-3 text-right text-blue-700 text-base">{fmt(calcTotal)}</td>
                        {roundTrip && <td />}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-slate-400">Select a route to see toll plazas</div>
              )
            ) : (
              /* Custom route — show rate card */
              <div className="p-6">
                {customDist > 0 ? (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Vehicle Category</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Rate / km</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Estimated Toll</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {CATEGORIES.map(c => {
                            const est = Math.round(customDist * RATE_PER_KM[c.key] * (roundTrip ? 2 : 1));
                            return (
                              <tr key={c.key} className={`hover:bg-slate-50 ${selCat === c.key ? 'bg-blue-50' : ''}`}>
                                <td className={`px-4 py-3 font-medium ${selCat === c.key ? 'text-blue-700' : 'text-slate-700'}`}>
                                  {selCat === c.key && <span className="mr-1">▶</span>}{c.label}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-500">₹{RATE_PER_KM[c.key]}/km</td>
                                <td className={`px-4 py-3 text-right font-semibold ${selCat === c.key ? 'text-blue-700 text-base' : 'text-slate-700'}`}>
                                  {fmt(est)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-slate-400">Estimates based on NHAI per-km rates. Actual toll may vary by corridor, plaza count, and exemptions.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                    <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                    <span className="text-sm">Enter origin, destination and distance to estimate toll</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: RECONCILIATION ─────────────────────────────────────────────── */}
      {tab === 'reconciliation' && (
        <div className="space-y-4">
          <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} count={filtered.length} total={recons.length} />

          {/* Status filter pills + Add button */}
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'}`}
              >
                {s} <span className={`ml-1 text-xs ${statusFilter === s ? 'text-blue-200' : 'text-slate-400'}`}>({counts[s]})</span>
              </button>
            ))}
            <button
              onClick={() => setShowAddRecon(true)}
              className="ml-auto flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Reconciliation
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Trip', 'Route', 'Highway', 'Vehicle', 'Category', 'Planned', 'FASTag', 'Cash', 'Actual', 'Variance', 'Status', 'Action'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-700">{r.tripId}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.route}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{r.highway}</td>
                      <td className="px-4 py-3 text-slate-600">{r.vehicleId}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{CAT_LABEL[r.vehicleCategory]}</td>
                      <td className="px-4 py-3 text-slate-700">{fmt(r.plannedToll)}</td>
                      <td className="px-4 py-3 text-blue-600">{r.fasttagAmount > 0 ? fmt(r.fasttagAmount) : '—'}</td>
                      <td className="px-4 py-3 text-amber-600">{r.cashAmount > 0 ? fmt(r.cashAmount) : '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{r.totalActual > 0 ? fmt(r.totalActual) : '—'}</td>
                      <td className={`px-4 py-3 font-semibold ${VARIANCE_COLORS[r.varianceType] || 'text-slate-500'}`}>
                        {r.variance === 0 ? '✓ 0' : (r.variance > 0 ? '+' : '') + fmt(r.variance)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[r.status] || 'bg-slate-100 text-slate-500'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDetailRec(r)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-sm">No records for this filter</div>
              )}
            </div>
          </div>

          {/* Variance legend */}
          <div className="flex gap-4 flex-wrap text-xs text-slate-500">
            <span>Variance = Actual − Planned &nbsp;·&nbsp;</span>
            <span className="text-red-600 font-medium">+ve = Overcharged</span>
            <span className="text-orange-600 font-medium">-ve = Under-reported / Missing</span>
            <span className="text-green-600 font-medium">0 = Perfect match</span>
          </div>
        </div>
      )}

      {/* ── TAB: VEHICLE MONTHLY SUMMARY ────────────────────────────────────── */}
      {tab === 'monthly' && (() => {
        // Group reconciliations by vehicle + month
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        // key format: "V001-May-2026"
        const grouped: Record<string, { vehicle: string; month: string; planned: number; fasttag: number; cash: number; actual: number; trips: number }> = {};
        recons.forEach(r => {
          const d = new Date(r.date);
          const mon = months[d.getMonth()];
          const yr  = d.getFullYear();
          const key = `${r.vehicleId}-${mon}-${yr}`;
          if (!grouped[key]) grouped[key] = { vehicle: r.vehicleId, month: `${mon} ${yr}`, planned: 0, fasttag: 0, cash: 0, actual: 0, trips: 0 };
          grouped[key].planned  += r.plannedToll;
          grouped[key].fasttag  += r.fasttagAmount;
          grouped[key].cash     += r.cashAmount;
          grouped[key].actual   += r.totalActual;
          grouped[key].trips    += 1;
        });
        const rows = Object.values(grouped).sort((a, b) => a.vehicle.localeCompare(b.vehicle));

        // Per-vehicle totals for the summary cards
        const byVehicle: Record<string, { planned: number; actual: number; fasttag: number; cash: number; trips: number }> = {};
        rows.forEach(r => {
          if (!byVehicle[r.vehicle]) byVehicle[r.vehicle] = { planned: 0, actual: 0, fasttag: 0, cash: 0, trips: 0 };
          byVehicle[r.vehicle].planned  += r.planned;
          byVehicle[r.vehicle].actual   += r.actual;
          byVehicle[r.vehicle].fasttag  += r.fasttag;
          byVehicle[r.vehicle].cash     += r.cash;
          byVehicle[r.vehicle].trips    += r.trips;
        });
        const vehicleTotals = Object.entries(byVehicle).map(([v, d]) => ({ vehicle: v, ...d }));

        return (
          <div className="space-y-5">
            {/* Vehicle total cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {vehicleTotals.map(vt => (
                <div key={vt.vehicle} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-slate-800">{vt.vehicle}</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{vt.trips} trip{vt.trips > 1 ? 's' : ''}</span>
                  </div>
                  <div className="text-xl font-bold text-blue-600">{fmt(vt.actual || vt.planned)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Total toll paid</div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-xs text-slate-500">
                    <span>FASTag <strong className="text-blue-500">{fmt(vt.fasttag)}</strong></span>
                    <span>Cash <strong className="text-amber-500">{fmt(vt.cash)}</strong></span>
                  </div>
                </div>
              ))}
            </div>

            {/* Month-wise breakdown table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-700">Vehicle-wise Monthly Toll Breakdown</h2>
                <button
                  onClick={() => {
                    const csv = ['Vehicle,Month,Trips,Planned (₹),FASTag (₹),Cash (₹),Total Actual (₹)',
                      ...rows.map(r => [r.vehicle, r.month, r.trips, r.planned, r.fasttag, r.cash, r.actual].join(','))
                    ].join('\n');
                    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
                    a.download = 'vehicle_monthly_toll.csv'; a.click();
                  }}
                  className="text-sm text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50"
                >⬇ Export CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Vehicle','Month','Trips','Planned','FASTag Deducted','Cash Paid','Total Actual','Variance'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map(r => {
                      const variance = r.actual - r.planned;
                      return (
                        <tr key={`${r.vehicle}-${r.month}`} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-800">{r.vehicle}</td>
                          <td className="px-4 py-3 text-slate-600">{r.month}</td>
                          <td className="px-4 py-3 text-slate-500">{r.trips}</td>
                          <td className="px-4 py-3 text-slate-700">{fmt(r.planned)}</td>
                          <td className="px-4 py-3 text-blue-600">{r.fasttag > 0 ? fmt(r.fasttag) : '—'}</td>
                          <td className="px-4 py-3 text-amber-600">{r.cash > 0 ? fmt(r.cash) : '—'}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{r.actual > 0 ? fmt(r.actual) : '—'}</td>
                          <td className={`px-4 py-3 font-semibold ${variance > 0 ? 'text-red-600' : variance < 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            {r.actual === 0 ? '—' : variance === 0 ? '✓ 0' : (variance > 0 ? '+' : '') + fmt(variance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-3 font-bold text-slate-700" colSpan={3}>Fleet Total</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{fmt(rows.reduce((s,r) => s + r.planned,0))}</td>
                      <td className="px-4 py-3 font-bold text-blue-700">{fmt(rows.reduce((s,r) => s + r.fasttag,0))}</td>
                      <td className="px-4 py-3 font-bold text-amber-700">{fmt(rows.reduce((s,r) => s + r.cash,0))}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{fmt(rows.reduce((s,r) => s + r.actual,0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* FASTag vs Cash stacked bar per vehicle */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">FASTag vs Cash — Payment Split by Vehicle</h3>
              <div className="space-y-3">
                {vehicleTotals.map(vt => {
                  const total = vt.fasttag + vt.cash;
                  const ftPct = total > 0 ? Math.round(vt.fasttag / total * 100) : 0;
                  const cashPct = 100 - ftPct;
                  return (
                    <div key={vt.vehicle} className="flex items-center gap-3">
                      <div className="w-12 text-xs font-semibold text-slate-700 text-right">{vt.vehicle}</div>
                      <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden flex">
                        {ftPct > 0 && (
                          <div className="h-full bg-blue-500 flex items-center justify-center" style={{ width: `${ftPct}%` }}>
                            {ftPct > 10 && <span className="text-white text-xs font-medium">{ftPct}%</span>}
                          </div>
                        )}
                        {cashPct > 0 && (
                          <div className="h-full bg-amber-400 flex items-center justify-center" style={{ width: `${cashPct}%` }}>
                            {cashPct > 10 && <span className="text-white text-xs font-medium">{cashPct}%</span>}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 w-28 text-right">
                        {fmt(vt.fasttag)} + {fmt(vt.cash)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-3 text-xs text-slate-500">
                <span>■ <span className="text-blue-500">FASTag</span></span>
                <span>■ <span className="text-amber-500">Cash</span></span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── TAB: FASTTAG LIVE ───────────────────────────────────────────────── */}
      {tab === 'fasttag' && (
        <div className="space-y-5">

          {/* Top bar — sync + settings */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${fastagSettings.configured ? 'bg-green-500' : 'bg-slate-300'} flex-shrink-0`} />
              <div>
                <div className="text-sm font-semibold text-slate-700">
                  {fastagSettings.configured ? `Connected — ${fastagSettings.bank}` : 'Not Connected — Configure API below'}
                </div>
                <div className="text-xs text-slate-400">
                  {lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleString('en-IN')}` : 'Never synced'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowSettings(s => !s)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 text-slate-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                API Settings
              </button>
              <button onClick={handleFastagSync} disabled={fastagSyncing}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {fastagSyncing
                  ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Syncing…</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Sync Now</>
                }
              </button>
            </div>
          </div>

          {/* API Settings panel */}
          {showSettings && (
            <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                Bank FASTag API Configuration
              </h3>
              <form onSubmit={handleSaveSettings} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name *</label>
                  <select className={SELECT} value={settingsForm.bank} onChange={e => setSettingsForm(f => ({ ...f, bank: e.target.value }))}>
                    <option value="">Select Bank…</option>
                    {['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Paytm Payments Bank', 'Kotak Mahindra Bank', 'IndusInd Bank', 'IDFC First Bank'].map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">API Key / Client Secret *</label>
                  <input type="password" className={INPUT} placeholder="Enter API key from bank portal"
                    value={settingsForm.apiKey} onChange={e => setSettingsForm(f => ({ ...f, apiKey: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Client ID</label>
                  <input className={INPUT} placeholder="Client ID from bank portal"
                    value={settingsForm.clientId} onChange={e => setSettingsForm(f => ({ ...f, clientId: e.target.value }))} />
                </div>
                <div className="md:col-span-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-400">Get API credentials from your bank&apos;s corporate FASTag portal. Supports NETC/NPCI standard APIs.</p>
                  <button type="submit" disabled={fastagSavingSettings}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                    {fastagSavingSettings && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    Save &amp; Connect
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* FASTag account balance cards */}
          {fastagSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total FASTag Balance', value: fmt(fastagSummary.totalBalance), color: 'text-blue-600' },
                { label: 'Active Accounts', value: String(fastagSummary.totalAccounts - fastagSummary.lowBalance - fastagSummary.inactive), color: 'text-green-600' },
                { label: 'Low Balance', value: String(fastagSummary.lowBalance), color: 'text-orange-600' },
                { label: 'Inactive', value: String(fastagSummary.inactive), color: 'text-red-600' },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                  <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Per-vehicle FASTag accounts */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Vehicle FASTag Accounts</h3>
              <button onClick={() => openAddFastag()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add FASTag Account
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Vehicle', 'Reg Number', 'FASTag ID', 'Bank', 'Balance', 'Status', 'Last Transaction', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fastagAccounts.map(a => {
                    const statusColor = a.status === 'Active' ? 'bg-green-100 text-green-700' : a.status === 'Low Balance' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700';
                    return (
                      <tr key={a.vehicleId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-700">{a.vehicleId}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{a.regNumber}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.fastagId}</td>
                        <td className="px-4 py-3 text-slate-600">{a.bank}</td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${a.balance < 500 ? 'text-red-600' : a.balance < 3000 ? 'text-orange-600' : 'text-slate-800'}`}>
                            {fmt(a.balance)}
                          </span>
                          {a.balance < 500 && <span className="ml-1 text-xs text-red-500">⚠ Recharge</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>{a.status}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(a.lastTransaction).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => openEditFastag(a)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 px-2 py-1 rounded-lg">
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vehicles without FASTag */}
          {(() => {
            const withFastag = new Set(fastagAccounts.map(a => a.vehicleId));
            const withoutFastag = recons
              .map(r => r.vehicleId)
              .filter((v, i, arr) => arr.indexOf(v) === i)
              .filter(v => !withFastag.has(v));
            if (withoutFastag.length === 0) return null;
            return (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <span className="text-sm font-semibold text-orange-700">{withoutFastag.length} vehicle(s) have no FASTag account</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {withoutFastag.map(v => (
                    <button key={v} onClick={() => openAddFastag(v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-orange-300 text-orange-700 text-xs font-medium rounded-lg hover:bg-orange-100">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Add FASTag for {v}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Transaction feed */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-semibold text-slate-700">FASTag Transaction Feed</h3>
              <div className="flex gap-2">
                {(['all', 'matched', 'unmatched'] as const).map(f => (
                  <button key={f} onClick={() => setTxnFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${txnFilter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                    {f === 'all' ? 'All' : f === 'matched' ? '✓ Matched' : '⚠ Unmatched'}
                    <span className="ml-1 opacity-60">
                      ({f === 'all' ? fastagTxns.length : f === 'matched' ? fastagTxns.filter(t => t.matched).length : fastagTxns.filter(t => !t.matched).length})
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Txn ID', 'Date & Time', 'Vehicle', 'Bank', 'Toll Plaza', 'Highway', 'Amount', 'Matched Trip', 'Action'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fastagTxns
                    .filter(t => txnFilter === 'all' ? true : txnFilter === 'matched' ? t.matched : !t.matched)
                    .map(t => (
                    <tr key={t.txnId} className={`hover:bg-slate-50 ${!t.matched ? 'bg-orange-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.txnId}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(t.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold text-slate-700">{t.vehicleId}</div>
                        <div className="text-xs text-slate-400 font-mono">{t.regNumber}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.bank}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{t.plaza}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{t.highway}</td>
                      <td className="px-4 py-3 font-bold text-blue-600">{fmt(t.amount)}</td>
                      <td className="px-4 py-3">
                        {t.matched && t.tripId
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">✓ {t.tripId}</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">Unmatched</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {!t.matched && (
                          <button onClick={() => { setLinkingTxn(t); setLinkTripId(''); }}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 px-2 py-1 rounded-lg">
                            Link Trip
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {fastagTxns.filter(t => txnFilter === 'all' ? true : txnFilter === 'matched' ? t.matched : !t.matched).length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">No transactions found</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit FASTag Account Modal ─────────────────────────────────── */}
      {fastagModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">
                {fastagModal.mode === 'add' ? 'Add FASTag Account' : 'Edit FASTag Account'}
              </h3>
              <button onClick={() => setFastagModal(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleFastagFormSave} className="p-6 space-y-4">
              {fastagModal.mode === 'add' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Vehicle ID *</label>
                  <select required className={SELECT} value={fastagForm.vehicleId}
                    onChange={e => setFastagForm(f => ({ ...f, vehicleId: e.target.value }))}>
                    <option value="">Select vehicle…</option>
                    {recons
                      .map(r => r.vehicleId)
                      .filter((v, i, arr) => arr.indexOf(v) === i)
                      .map(v => <option key={v} value={v}>{v}</option>)}
                    {fastagAccounts.length === 0 && <option value="V001">V001</option>}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Or type any vehicle ID (e.g. V001, V002…)</p>
                  <input className={INPUT + ' mt-1'} placeholder="Or type Vehicle ID directly"
                    value={fastagForm.vehicleId} onChange={e => setFastagForm(f => ({ ...f, vehicleId: e.target.value }))} />
                </div>
              )}
              {fastagModal.mode === 'edit' && (
                <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600">
                  Vehicle: <strong>{fastagModal.vehicleId}</strong>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">FASTag ID *</label>
                <input required className={INPUT} placeholder="e.g. FT-HDFC-MH12AB1234"
                  value={fastagForm.fastagId} onChange={e => setFastagForm(f => ({ ...f, fastagId: e.target.value.toUpperCase() }))} />
                <p className="text-xs text-slate-400 mt-1">Found on your FASTag sticker or bank portal</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Issuing Bank *</label>
                <select required className={SELECT} value={fastagForm.bank}
                  onChange={e => setFastagForm(f => ({ ...f, bank: e.target.value }))}>
                  <option value="">Select bank…</option>
                  {['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Paytm Payments Bank', 'Kotak Mahindra Bank', 'IndusInd Bank', 'IDFC First Bank', 'Punjab National Bank', 'Bank of Baroda'].map(b => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </div>
              {fastagModal.mode === 'edit' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Current Balance (₹)</label>
                  <input type="number" min={0} className={INPUT} placeholder="Enter current wallet balance"
                    value={fastagForm.balance} onChange={e => setFastagForm(f => ({ ...f, balance: e.target.value }))} />
                  <p className="text-xs text-slate-400 mt-1">Balance below ₹500 triggers Low Balance alert</p>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setFastagModal(null)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={fastagFormSaving}
                  className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {fastagFormSaving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {fastagFormSaving ? 'Saving…' : fastagModal.mode === 'add' ? 'Add Account' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Link Trip Modal ─────────────────────────────────────────────────── */}
      {linkingTxn && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-800 mb-1">Link to Trip</h3>
            <p className="text-xs text-slate-500 mb-4">{linkingTxn.plaza} · {fmt(linkingTxn.amount)} · {linkingTxn.vehicleId}</p>
            <input value={linkTripId} onChange={e => setLinkTripId(e.target.value)}
              placeholder="Enter Trip ID (e.g. T001)" className={INPUT + ' mb-4'} />
            <div className="flex justify-end gap-3">
              <button onClick={() => setLinkingTxn(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={handleLinkTrip} disabled={!linkTripId.trim()}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Reconciliation Modal ─────────────────────────────────────────── */}
      {showAddRecon && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddRecon(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Add Reconciliation Entry</h3>
              <button onClick={() => setShowAddRecon(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAddRecon} className="p-6 space-y-5">

              {/* Route */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Route</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">From City *</label>
                    <input required className={INPUT} placeholder="Mumbai" value={addReconForm.origin} onChange={e => setArf('origin', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">To City *</label>
                    <input required className={INPUT} placeholder="Delhi" value={addReconForm.destination} onChange={e => setArf('destination', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Highway / Corridor</label>
                    <input className={INPUT} placeholder="NH-48" value={addReconForm.highway} onChange={e => setArf('highway', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Distance (km)</label>
                    <input type="number" min={0} className={INPUT} placeholder="1400" value={addReconForm.distance} onChange={e => setArf('distance', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Vehicle */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Vehicle & Trip</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Vehicle ID</label>
                    <input className={INPUT} placeholder="V001" value={addReconForm.vehicleId} onChange={e => setArf('vehicleId', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Trip ID</label>
                    <input className={INPUT} placeholder="T009 (optional)" value={addReconForm.tripId} onChange={e => setArf('tripId', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Vehicle Category *</label>
                    <select required className={SELECT} value={addReconForm.vehicleCategory} onChange={e => setArf('vehicleCategory', e.target.value)}>
                      {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Trip Date *</label>
                    <input required type="date" className={INPUT} value={addReconForm.date} onChange={e => setArf('date', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Toll amounts */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Toll Amounts (₹)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Planned *</label>
                    <input required type="number" min={0} className={INPUT} placeholder="4500" value={addReconForm.plannedToll} onChange={e => setArf('plannedToll', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">FASTag Deducted</label>
                    <input type="number" min={0} className={INPUT} placeholder="0" value={addReconForm.fasttagAmount} onChange={e => setArf('fasttagAmount', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Cash Paid</label>
                    <input type="number" min={0} className={INPUT} placeholder="0" value={addReconForm.cashAmount} onChange={e => setArf('cashAmount', e.target.value)} />
                  </div>
                </div>
                {(addReconForm.fasttagAmount || addReconForm.cashAmount) && addReconForm.plannedToll && (() => {
                  const actual = (parseFloat(addReconForm.fasttagAmount) || 0) + (parseFloat(addReconForm.cashAmount) || 0);
                  const variance = actual - (parseFloat(addReconForm.plannedToll) || 0);
                  return (
                    <div className={`mt-2 p-2 rounded-lg text-xs font-medium ${variance === 0 ? 'bg-green-50 text-green-700' : variance > 0 ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'}`}>
                      Actual: {fmt(actual)} · Variance: {variance === 0 ? '✓ Matched' : (variance > 0 ? '+' : '') + fmt(variance)}
                    </div>
                  );
                })()}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Notes</label>
                <textarea rows={2} className={INPUT} placeholder="Any remarks..." value={addReconForm.notes} onChange={e => setArf('notes', e.target.value)} />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddRecon(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={addReconSaving} className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {addReconSaving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {addReconSaving ? 'Saving...' : 'Add Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {detailRec && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetailRec(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            {/* Modal Header */}
            <div className="flex items-start justify-between p-6 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-slate-800">{detailRec.tripId} — Toll Reconciliation</h2>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[detailRec.status] || 'bg-slate-100 text-slate-500'}`}>
                    {detailRec.status}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{detailRec.route} · {detailRec.highway} · {detailRec.distance} km</p>
              </div>
              <button onClick={() => setDetailRec(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-6 bg-slate-50 border-b border-slate-100">
              {[
                { l: 'Planned',  v: fmt(detailRec.plannedToll),    c: 'text-slate-800' },
                { l: 'FASTag',   v: detailRec.fasttagAmount > 0 ? fmt(detailRec.fasttagAmount) : '—', c: 'text-blue-600' },
                { l: 'Cash',     v: detailRec.cashAmount > 0 ? fmt(detailRec.cashAmount) : '—', c: 'text-amber-600' },
                { l: 'Actual',   v: detailRec.totalActual > 0 ? fmt(detailRec.totalActual) : '—', c: 'text-slate-800' },
                { l: 'Variance', v: detailRec.variance === 0 ? '✓ Matched' : (detailRec.variance > 0 ? '+' : '') + fmt(detailRec.variance), c: VARIANCE_COLORS[detailRec.varianceType] || 'text-slate-500' },
              ].map(x => (
                <div key={x.l} className="text-center">
                  <div className={`text-lg font-bold ${x.c}`}>{x.v}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{x.l}</div>
                </div>
              ))}
            </div>

            {/* Vehicle & Date row */}
            <div className="flex gap-6 px-6 py-3 border-b border-slate-100 text-sm text-slate-600">
              <span>Vehicle: <strong>{detailRec.vehicleId}</strong></span>
              <span>Category: <strong>{CAT_LABEL[detailRec.vehicleCategory]}</strong></span>
              <span>Date: <strong>{detailRec.date}</strong></span>
            </div>

            {/* Plaza-level breakdown */}
            {detailRec.plazaEntries.length > 0 ? (
              <div className="p-6">
                <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Plaza-by-Plaza Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Toll Plaza</th>
                        <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Planned</th>
                        <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">FASTag</th>
                        <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Cash</th>
                        <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Variance</th>
                        <th className="text-center px-3 py-2 text-xs text-slate-500 font-medium">Status</th>
                        <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {detailRec.plazaEntries.map((pe, i) => {
                        const actual  = pe.fasttag + pe.cash;
                        const variance= actual - pe.planned;
                        return (
                          <tr key={i} className={pe.status !== 'Matched' ? 'bg-orange-50' : 'hover:bg-slate-50'}>
                            <td className="px-3 py-2 font-medium text-slate-800">{pe.plazaName}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{fmt(pe.planned)}</td>
                            <td className="px-3 py-2 text-right text-blue-600">{pe.fasttag > 0 ? fmt(pe.fasttag) : '—'}</td>
                            <td className="px-3 py-2 text-right text-amber-600">{pe.cash > 0 ? fmt(pe.cash) : '—'}</td>
                            <td className={`px-3 py-2 text-right font-medium ${variance > 0 ? 'text-red-600' : variance < 0 ? 'text-orange-600' : 'text-green-600'}`}>
                              {variance === 0 ? '—' : (variance > 0 ? '+' : '') + fmt(variance)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PLAZA_STATUS_COLORS[pe.status] || 'bg-slate-100 text-slate-500'}`}>
                                {pe.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-400 max-w-xs">{pe.note || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-6 text-slate-400 text-sm text-center">No plaza entries yet — trip not started</div>
            )}

            {/* Notes */}
            {detailRec.notes && (
              <div className="mx-6 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <span className="font-semibold">Note: </span>{detailRec.notes}
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setDetailRec(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Close</button>
              {detailRec.status !== 'Reconciled' && detailRec.totalActual > 0 && (
                <button
                  onClick={() => markReconciled(detailRec.id)}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                >
                  ✓ Mark as Reconciled
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
