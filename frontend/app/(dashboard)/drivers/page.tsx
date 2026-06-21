'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';

interface SupervisorRecord {
  supervisor: string;
  fromMonth: string;
  toMonth: string | null;
}

interface BankDetails {
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
}

interface Driver {
  id: string; name: string; phone: string; altPhone: string;
  dlNumber: string; licenseCategory: string; licenseExpiry: string;
  experience: number; status: string; assignedVehicle: string;
  fuelScore: number; safetyScore: number; onTimeDelivery: number;
  customerRating: number; totalTrips: number; totalKm: number;
  violations: number; salary: number; attendance: number;
  address: string; dob: string; emergencyContact: string;
  aadhaarNumber: string;
  panNumber: string;
  supervisorName: string;
  supervisorHistory: SupervisorRecord[];
  bankDetails: BankDetails;
  photo?: string | null;
}

const EMPTY_BANK: BankDetails = { bankName: '', accountNumber: '', ifsc: '', upiId: '' };

const EMPTY_FORM = {
  name: '', phone: '', altPhone: '', dob: '', address: '',
  dlNumber: '', licenseCategory: 'HMV', licenseExpiry: '',
  experience: 0, emergencyContact: '', salary: 0,
  aadhaarNumber: '', panNumber: '', supervisorName: 'Self',
  bankName: '', accountNumber: '', ifsc: '', upiId: '',
};

const INPUT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const SELECT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function DriverAvatar({ name, photo, size = 'sm' }: { name: string; photo?: string | null; size?: 'sm' | 'lg' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-12 h-12 text-xl';
  if (photo) return <img src={photo} alt={name} className={`${dim} rounded-full object-cover flex-shrink-0`} />;
  return (
    <div className={`${dim} rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold flex-shrink-0`}>
      {name.charAt(0)}
    </div>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 bg-slate-100 rounded-full flex-shrink-0">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-slate-600">{value}</span>
    </div>
  );
}

function maskAadhaar(num: string) {
  if (!num || num.length < 4) return '••••-••••-' + (num || '????');
  return `••••-••••-${num.slice(-4)}`;
}

function maskAccount(num: string) {
  if (!num || num.length < 4) return '—';
  return `${'•'.repeat(Math.max(num.length - 4, 4))}${num.slice(-4)}`;
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

function currentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── Excel helpers ──────────────────────────────────────────────
function driversToRows(data: Driver[]) {
  return data.map(d => ({
    'Name': d.name, 'Phone': d.phone, 'Alt Phone': d.altPhone,
    'DOB': d.dob, 'Address': d.address,
    'Aadhaar Number': d.aadhaarNumber, 'PAN Number': d.panNumber,
    'DL Number': d.dlNumber, 'License Category': d.licenseCategory,
    'License Expiry': d.licenseExpiry, 'Experience (yrs)': d.experience,
    'Emergency Contact': d.emergencyContact, 'Monthly Salary (₹)': d.salary,
    'Supervisor': d.supervisorName, 'Status': d.status,
  }));
}

function downloadDriversExcel(data: Driver[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(driversToRows(data));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Drivers');
  XLSX.writeFile(wb, filename);
}

function downloadDriverTemplate() {
  const row = {
    'Name': 'Ramesh Kumar', 'Phone': '9876543210', 'Alt Phone': '8765432109',
    'DOB': '1985-04-12', 'Address': 'Pune, Maharashtra',
    'Aadhaar Number': '234156789012', 'PAN Number': 'AABPK1234Q',
    'DL Number': 'MH-12-20150045678', 'License Category': 'HMV',
    'License Expiry': '2028-04-11', 'Experience (yrs)': 12,
    'Emergency Contact': '9988776655', 'Monthly Salary (₹)': 28000,
    'Supervisor': 'Self', 'Status': 'Active',
  };
  const ws = XLSX.utils.json_to_sheet([row]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'driver_upload_template.xlsx');
}

export default function DriversPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <DriversPageInner />
    </Suspense>
  );
}

function DriversPageInner() {
  const searchParams = useSearchParams();
  const searchParam = searchParams.get('search');

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParam || '');
  const [selected, setSelected] = useState<Driver | null>(null);
  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange } = useDateRange();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showChangeSup, setShowChangeSup] = useState(false);
  const [newSupervisor, setNewSupervisor] = useState('');
  const [showEditBank, setShowEditBank] = useState(false);
  const [bankForm, setBankForm] = useState<BankDetails>(EMPTY_BANK);
  const [bankSaving, setBankSaving] = useState(false);
  const [addPhotoPreview, setAddPhotoPreview] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const addPhotoRef = useRef<HTMLInputElement>(null);
  const detailPhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.drivers().then(setDrivers).catch(console.error).finally(() => setLoading(false));
  }, []);

  const dateFiltered = drivers.filter(d => inRange(d.licenseExpiry));
  const baseDrivers = dateFiltered.length > 0 ? dateFiltered : drivers;
  const filtered = baseDrivers.filter(d =>
    d.id.toLowerCase().includes(search.toLowerCase()) ||
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.dlNumber.toLowerCase().includes(search.toLowerCase()) ||
    d.phone.includes(search)
  );

  const statusColors: Record<string, string> = {
    Active: 'bg-green-100 text-green-700',
    Leave: 'bg-orange-100 text-orange-700',
    Inactive: 'bg-slate-100 text-slate-500',
  };

  const daysUntil = (dateStr: string) => Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);

  function set(field: string, value: string | number) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const newDriver: Driver = await (api as any).addDriver({ ...form, photo: addPhotoPreview });
      setDrivers(d => [newDriver, ...d]);
      setForm(EMPTY_FORM);
      setAddPhotoPreview(null);
      setShowAdd(false);
      setSuccessMsg(`Driver ${form.name} added successfully!`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  function handleAddPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setAddPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleDetailPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selected) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoSaving(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      const photo = ev.target?.result as string;
      try {
        await (api as any).updateDriverPhoto(selected.id, photo);
        const updated = { ...selected, photo };
        setDrivers(ds => ds.map(d => d.id === selected.id ? updated : d));
        setSelected(updated);
      } catch (err) { console.error(err); }
      finally { setPhotoSaving(false); }
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveBankDetails() {
    if (!selected) return;
    setBankSaving(true);
    try {
      const res = await api.updateDriverBankDetails(selected.id, bankForm);
      const updated = { ...selected, bankDetails: res.driver.bankDetails };
      setDrivers(ds => ds.map(d => d.id === selected.id ? updated : d));
      setSelected(updated);
      setShowEditBank(false);
      setSuccessMsg(`Bank details updated for ${selected.name}`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setBankSaving(false);
    }
  }

  function handleChangeSupervisor() {
    if (!selected || !newSupervisor.trim()) return;
    const ym = currentYM();
    const updatedHistory: SupervisorRecord[] = [
      ...selected.supervisorHistory.map(h => h.toMonth === null ? { ...h, toMonth: ym } : h),
      { supervisor: newSupervisor.trim(), fromMonth: ym, toMonth: null },
    ];
    const updated = { ...selected, supervisorName: newSupervisor.trim(), supervisorHistory: updatedHistory };
    setDrivers(ds => ds.map(d => d.id === selected.id ? updated : d));
    setSelected(updated);
    setShowChangeSup(false);
    setNewSupervisor('');
    setSuccessMsg(`Supervisor updated for ${selected.name}`);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<string, string | number>[];
      const imported: Driver[] = rows.map((row, i) => ({
        id: 'DI' + (Date.now() + i).toString().slice(-6),
        name: String(row['Name'] || ''),
        phone: String(row['Phone'] || ''),
        altPhone: String(row['Alt Phone'] || ''),
        dob: String(row['DOB'] || ''),
        address: String(row['Address'] || ''),
        aadhaarNumber: String(row['Aadhaar Number'] || ''),
        panNumber: String(row['PAN Number'] || ''),
        dlNumber: String(row['DL Number'] || ''),
        licenseCategory: String(row['License Category'] || 'HMV'),
        licenseExpiry: String(row['License Expiry'] || ''),
        experience: Number(row['Experience (yrs)']) || 0,
        emergencyContact: String(row['Emergency Contact'] || ''),
        salary: Number(row['Monthly Salary (₹)']) || 0,
        supervisorName: String(row['Supervisor'] || 'Self'),
        status: String(row['Status'] || 'Active'),
        assignedVehicle: '', fuelScore: 0, safetyScore: 0,
        onTimeDelivery: 0, customerRating: 0, totalTrips: 0,
        totalKm: 0, violations: 0, attendance: 100,
        supervisorHistory: [{ supervisor: String(row['Supervisor'] || 'Self'), fromMonth: currentYM(), toMonth: null }],
        bankDetails: EMPTY_BANK,
      }));
      setDrivers(d => [...imported, ...d]);
      setSuccessMsg(`${imported.length} driver(s) imported successfully!`);
      setTimeout(() => setSuccessMsg(''), 4000);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
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

      <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} count={dateFiltered.length} total={drivers.length} />

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Drivers', value: drivers.length, color: 'text-slate-800' },
          { label: 'Active', value: drivers.filter(d => d.status === 'Active').length, color: 'text-green-600' },
          { label: 'On Leave', value: drivers.filter(d => d.status === 'Leave').length, color: 'text-orange-600' },
          { label: 'Avg Safety Score', value: drivers.length ? Math.round(drivers.reduce((s, d) => s + d.safetyScore, 0) / drivers.length) : 0, color: 'text-blue-600' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={uploadRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
            <button onClick={downloadDriverTemplate}
              className="px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Template
            </button>
            <button onClick={() => uploadRef.current?.click()}
              className="px-3 py-2 text-sm text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Upload Excel
            </button>
            <button onClick={() => downloadDriversExcel(baseDrivers, 'drivers_data.xlsx')}
              className="px-3 py-2 text-sm text-blue-700 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download Excel
            </button>
            <button onClick={() => setShowAdd(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Driver
            </button>
          </div>
          <input type="text" placeholder="Search driver name, DL, or phone..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-72 ml-auto" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Driver', 'Foreman / Supervisor', 'Phone', 'Address', 'Aadhaar', 'PAN', 'DL / Expiry', 'Experience', 'Status', 'Fuel Score', 'Safety Score', 'On-Time %', 'Rating', 'Trips', 'Salary', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(d => {
                const dlDays = d.licenseExpiry ? daysUntil(d.licenseExpiry) : null;
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <DriverAvatar name={d.name} photo={d.photo} size="sm" />
                        <div className="text-sm font-medium text-slate-800 whitespace-nowrap">{d.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {d.supervisorName === 'Self' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Self</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 whitespace-nowrap">{d.supervisorName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{d.phone}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[140px] truncate">{d.address}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{maskAadhaar(d.aadhaarNumber)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{d.panNumber || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-mono text-slate-700">{d.dlNumber}</div>
                      {dlDays !== null && (
                        <div className={`text-xs mt-0.5 ${dlDays < 180 ? 'text-orange-600 font-medium' : 'text-slate-500'}`}>
                          {d.licenseExpiry} {dlDays < 180 ? `(${dlDays}d)` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{d.experience} yrs</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[d.status] || 'bg-slate-100 text-slate-600'}`}>{d.status}</span></td>
                    <td className="px-4 py-3"><ScoreBar value={d.fuelScore} color="bg-blue-400" /></td>
                    <td className="px-4 py-3"><ScoreBar value={d.safetyScore} color={d.safetyScore >= 85 ? 'bg-green-500' : d.safetyScore >= 70 ? 'bg-yellow-500' : 'bg-red-400'} /></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{d.onTimeDelivery}%</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                        <span className="text-xs font-medium text-slate-700">{d.customerRating}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{d.totalTrips}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">₹{d.salary.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setSelected(d); setShowChangeSup(false); setShowEditBank(false); }} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Profile</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center text-slate-400 text-sm py-10">No drivers match your search.</div>
          )}
        </div>
      </div>

      {/* ── Add Driver Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Add New Driver</h3>
              <button onClick={() => { setShowAdd(false); setAddPhotoPreview(null); }} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-5">
              {/* Photo upload */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative group cursor-pointer" onClick={() => addPhotoRef.current?.click()}>
                  {addPhotoPreview
                    ? <img src={addPhotoPreview} alt="Preview" className="w-20 h-20 rounded-full object-cover" />
                    : <div className="w-20 h-20 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1">
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        <span className="text-xs text-slate-400">Photo</span>
                      </div>
                  }
                  {addPhotoPreview && (
                    <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/></svg>
                    </div>
                  )}
                  <input ref={addPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleAddPhotoChange} />
                </div>
                <span className="text-xs text-slate-400">Click to upload photo (optional)</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Personal Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Full Name *">
                    <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ramesh Kumar" className={INPUT} />
                  </Field>
                  <Field label="Date of Birth *">
                    <input required type="date" value={form.dob} onChange={e => set('dob', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Mobile Number *">
                    <input required value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" maxLength={10} className={INPUT} />
                  </Field>
                  <Field label="Alternate Number">
                    <input value={form.altPhone} onChange={e => set('altPhone', e.target.value)} placeholder="Optional" className={INPUT} />
                  </Field>
                  <Field label="Emergency Contact *">
                    <input required value={form.emergencyContact} onChange={e => set('emergencyContact', e.target.value)} placeholder="9876543210" className={INPUT} />
                  </Field>
                  <Field label="Address *">
                    <input required value={form.address} onChange={e => set('address', e.target.value)} placeholder="City, State" className={INPUT} />
                  </Field>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Identity Documents</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Aadhaar Number *">
                    <input required value={form.aadhaarNumber} onChange={e => set('aadhaarNumber', e.target.value.replace(/\D/g, ''))}
                      placeholder="12-digit Aadhaar number" maxLength={12} className={INPUT} />
                  </Field>
                  <Field label="PAN Number *">
                    <input required value={form.panNumber} onChange={e => set('panNumber', e.target.value.toUpperCase())}
                      placeholder="ABCDE1234F" maxLength={10} className={INPUT} />
                  </Field>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">License &amp; Experience</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="DL Number *">
                    <input required value={form.dlNumber} onChange={e => set('dlNumber', e.target.value)} placeholder="MH-12-20200012345" className={INPUT} />
                  </Field>
                  <Field label="License Category *">
                    <select required value={form.licenseCategory} onChange={e => set('licenseCategory', e.target.value)} className={SELECT}>
                      {['HMV', 'LMV', 'MCWG', 'HMV+Trailer'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="License Expiry Date *">
                    <input required type="date" value={form.licenseExpiry} onChange={e => set('licenseExpiry', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Years of Experience *">
                    <input required type="number" min={0} max={50} value={form.experience}
                      onChange={e => set('experience', parseInt(e.target.value))} className={INPUT} />
                  </Field>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Payroll &amp; Supervisor</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Monthly Salary (₹) *">
                    <input required type="number" min={0} value={form.salary}
                      onChange={e => set('salary', parseInt(e.target.value))} placeholder="25000" className={INPUT} />
                  </Field>
                  <Field label="Foreman / Supervisor">
                    <input value={form.supervisorName} onChange={e => set('supervisorName', e.target.value)}
                      placeholder="Name or 'Self'" className={INPUT} />
                  </Field>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Bank / UPI Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Bank Name">
                    <input value={form.bankName} onChange={e => set('bankName', e.target.value)} placeholder="State Bank of India" className={INPUT} />
                  </Field>
                  <Field label="Account Number">
                    <input value={form.accountNumber} onChange={e => set('accountNumber', e.target.value.replace(/\D/g, ''))} placeholder="Account number" className={INPUT} />
                  </Field>
                  <Field label="IFSC Code">
                    <input value={form.ifsc} onChange={e => set('ifsc', e.target.value.toUpperCase())} placeholder="SBIN0001234" maxLength={11} className={INPUT} />
                  </Field>
                  <Field label="UPI ID">
                    <input value={form.upiId} onChange={e => set('upiId', e.target.value)} placeholder="name@upi" className={INPUT} />
                  </Field>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Saving...' : 'Add Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Driver Profile Modal ── */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="relative group cursor-pointer" onClick={() => detailPhotoRef.current?.click()} title="Click to change photo">
                  <DriverAvatar name={selected.name} photo={selected.photo} size="lg" />
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {photoSaving
                      ? <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      : <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    }
                  </div>
                  <input ref={detailPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleDetailPhotoChange} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{selected.name}</h3>
                  <p className="text-sm text-slate-500">{selected.licenseCategory} · {selected.experience} years exp.</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Personal & Identity */}
            <div className="grid grid-cols-2 gap-3 text-sm mb-5">
              {[
                ['Phone', selected.phone],
                ['Alt Phone', selected.altPhone || '—'],
                ['DOB', selected.dob],
                ['Address', selected.address],
                ['Aadhaar', maskAadhaar(selected.aadhaarNumber)],
                ['PAN', selected.panNumber || '—'],
                ['DL Number', selected.dlNumber],
                ['DL Expiry', selected.licenseExpiry],
                ['Emergency', selected.emergencyContact],
                ['Salary', `₹${selected.salary.toLocaleString('en-IN')}`],
                ['Total Trips', String(selected.totalTrips)],
                ['Total KM', `${selected.totalKm.toLocaleString()} km`],
                ['Violations', String(selected.violations)],
                ['Attendance', `${selected.attendance}%`],
              ].map(([k, v]) => (
                <div key={k}><div className="text-xs text-slate-500">{k}</div><div className="font-medium text-slate-800 break-words">{v}</div></div>
              ))}
            </div>

            {/* Supervisor Section */}
            <div className="border-t border-slate-100 pt-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase">Foreman / Supervisor</h4>
                <button onClick={() => setShowChangeSup(s => !s)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-2 py-1 rounded-lg">
                  {showChangeSup ? 'Cancel' : 'Change Supervisor'}
                </button>
              </div>

              {/* Current supervisor */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                  {selected.supervisorName === 'Self' ? 'S' : selected.supervisorName.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-800">{selected.supervisorName}</div>
                  <div className="text-xs text-slate-500">Current Supervisor</div>
                </div>
              </div>

              {/* Change supervisor form */}
              {showChangeSup && (
                <div className="bg-slate-50 rounded-lg p-3 mb-3 flex gap-2">
                  <input value={newSupervisor} onChange={e => setNewSupervisor(e.target.value)}
                    placeholder="New supervisor name or 'Self'"
                    className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={handleChangeSupervisor}
                    disabled={!newSupervisor.trim()}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    Save
                  </button>
                </div>
              )}

              {/* Supervisor History Timeline */}
              <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Supervisor History</h4>
              <div className="space-y-1.5">
                {[...selected.supervisorHistory].reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${h.toMonth === null ? 'bg-green-500' : 'bg-slate-300'}`} />
                    <div>
                      <div className="text-sm font-medium text-slate-800">{h.supervisor}</div>
                      <div className="text-xs text-slate-500">
                        {fmtMonth(h.fromMonth)} – {h.toMonth ? fmtMonth(h.toMonth) : <span className="text-green-600 font-medium">Present</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bank / UPI Details */}
            <div className="border-t border-slate-100 pt-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase">Bank / UPI Details</h4>
                <button onClick={() => {
                  setBankForm(selected.bankDetails || EMPTY_BANK);
                  setShowEditBank(s => !s);
                }} className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-2 py-1 rounded-lg">
                  {showEditBank ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {showEditBank ? (
                <div className="bg-slate-50 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Bank Name">
                      <input value={bankForm.bankName} onChange={e => setBankForm(f => ({ ...f, bankName: e.target.value }))} placeholder="State Bank of India" className={INPUT} />
                    </Field>
                    <Field label="Account Number">
                      <input value={bankForm.accountNumber} onChange={e => setBankForm(f => ({ ...f, accountNumber: e.target.value.replace(/\D/g, '') }))} placeholder="Account number" className={INPUT} />
                    </Field>
                    <Field label="IFSC Code">
                      <input value={bankForm.ifsc} onChange={e => setBankForm(f => ({ ...f, ifsc: e.target.value.toUpperCase() }))} placeholder="SBIN0001234" maxLength={11} className={INPUT} />
                    </Field>
                    <Field label="UPI ID">
                      <input value={bankForm.upiId} onChange={e => setBankForm(f => ({ ...f, upiId: e.target.value }))} placeholder="name@upi" className={INPUT} />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={handleSaveBankDetails} disabled={bankSaving}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                      {bankSaving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                      {bankSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-slate-500">Bank Name</div><div className="font-medium text-slate-800">{selected.bankDetails?.bankName || '—'}</div></div>
                  <div><div className="text-xs text-slate-500">Account Number</div><div className="font-medium text-slate-800 font-mono">{maskAccount(selected.bankDetails?.accountNumber || '')}</div></div>
                  <div><div className="text-xs text-slate-500">IFSC Code</div><div className="font-medium text-slate-800 font-mono">{selected.bankDetails?.ifsc || '—'}</div></div>
                  <div><div className="text-xs text-slate-500">UPI ID</div><div className="font-medium text-slate-800">{selected.bankDetails?.upiId || '—'}</div></div>
                </div>
              )}
            </div>

            {/* Performance KPIs */}
            {selected.safetyScore > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">Performance KPIs</h4>
                <div className="space-y-2">
                  {[
                    { label: 'Fuel Efficiency Score', value: selected.fuelScore, color: 'bg-blue-500' },
                    { label: 'Safety Score', value: selected.safetyScore, color: 'bg-green-500' },
                    { label: 'On-Time Delivery %', value: selected.onTimeDelivery, color: 'bg-violet-500' },
                    { label: 'Customer Rating', value: Math.round(selected.customerRating * 20), color: 'bg-yellow-500' },
                  ].map(kpi => (
                    <div key={kpi.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600">{kpi.label}</span>
                        <span className="font-medium text-slate-800">{kpi.label.includes('Rating') ? selected.customerRating : kpi.value}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full"><div className={`h-1.5 rounded-full ${kpi.color}`} style={{ width: `${kpi.value}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
