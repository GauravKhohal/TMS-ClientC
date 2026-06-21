const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('tms_token');
}

// Stale-while-revalidate cache for GET requests: once a page has been visited,
// every later visit renders instantly from cache (zero network wait) while a
// fresh copy is silently fetched in the background to keep the cache current
// for the *next* visit. Any non-GET request clears the cache so edits/approvals
// are reflected immediately rather than serving stale data.
const REVALIDATE_AFTER_MS = 15_000;
const cache = new Map<string, { data: unknown; ts: number }>();
const inFlight = new Map<string, Promise<unknown>>();

function authHeaders(options: RequestInit): RequestInit {
  const token = getToken();
  return {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  };
}

async function fetchAndCache(path: string, options: RequestInit, isGet: boolean) {
  const res = await fetch(`${BASE_URL}${path}`, authHeaders(options));
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();

  if (isGet) cache.set(path, { data, ts: Date.now() });
  else cache.clear();

  return data;
}

function revalidateInBackground(path: string, options: RequestInit) {
  if (inFlight.has(path)) return;
  const p = fetchAndCache(path, options, true)
    .catch(() => {}) // background refresh — surface errors only on the next foreground request
    .finally(() => inFlight.delete(path));
  inFlight.set(path, p);
}

async function request(path: string, options: RequestInit = {}) {
  const isGet = !options.method || options.method === 'GET';

  if (isGet) {
    const cached = cache.get(path);
    if (cached) {
      if (Date.now() - cached.ts > REVALIDATE_AFTER_MS) revalidateInBackground(path, options);
      return cached.data;
    }
  }

  return fetchAndCache(path, options, isGet);
}

export const api = {
  login: (email: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  dashboard: () => request('/dashboard'),
  fleet: () => request('/fleet'),
  fleetById: (id: string) => request(`/fleet/${id}`),
  createVehicle: (data: object) => request('/fleet', { method: 'POST', body: JSON.stringify(data) }),
  drivers: () => request('/drivers'),
  driverById: (id: string) => request(`/drivers/${id}`),
  addDriver: (data: object) => request('/drivers', { method: 'POST', body: JSON.stringify(data) }),
  updateDriverPhoto: (id: string, photo: string | null) => request(`/drivers/${id}/photo`, { method: 'PATCH', body: JSON.stringify({ photo }) }),
  trips: () => request('/trips'),
  tripById: (id: string) => request(`/trips/${id}`),
  createTrip: (data: object) => request('/trips', { method: 'POST', body: JSON.stringify(data) }),
  updateTrip: (id: string, data: object) => request(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  approveTrip: (id: string) => request(`/trips/${id}/approve`, { method: 'PATCH' }),
  rejectTrip: (id: string, reason: string) => request(`/trips/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
  confirmPlacement: (id: string, data: object) => request(`/trips/${id}/placement`, { method: 'PATCH', body: JSON.stringify(data) }),
  generateCN: (id: string, data: object) => request(`/trips/${id}/cn`, { method: 'PATCH', body: JSON.stringify(data) }),
  consignments: () => request('/consignments'),
  createConsignment: (data: object) => request('/consignments', { method: 'POST', body: JSON.stringify(data) }),
  fuel: () => request('/fuel'),
  addFuelEntry: (data: object) => request('/fuel', { method: 'POST', body: JSON.stringify(data) }),
  maintenance: () => request('/maintenance'),
  addMaintenanceRecord: (data: object) => request('/maintenance', { method: 'POST', body: JSON.stringify(data) }),
  compliance: () => request('/compliance'),
  saveCompliance: (vehicleId: string, data: object) => request(`/compliance/${vehicleId}`, { method: 'PUT', body: JSON.stringify(data) }),
  alerts: () => request('/alerts'),
  costing: () => request('/costing'),
  analytics: () => request('/analytics'),
  users: () => request('/users'),
  getActivity: () => request('/activity'),
  getAuditLog: () => request('/audit-log'),
  logPageVisit: (page: string) => request('/activity/visit', { method: 'POST', body: JSON.stringify({ page }) }),
  updateTripToll: (tripId: string, actualToll: number) =>
    request(`/costing/${tripId}/toll`, { method: 'PATCH', body: JSON.stringify({ actualToll }) }),
  tollRoutes: () => request('/toll/routes'),
  citySearch: (q: string) => request(`/city-suggest?q=${encodeURIComponent(q)}`),
  citySearchRemote: (q: string) => request(`/city-suggest-remote?q=${encodeURIComponent(q)}`),
  calcDistance: (fromLat: number, fromLng: number, toLat: number, toLng: number, fromName: string, toName: string) =>
    request(`/calc-distance?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}&fromName=${encodeURIComponent(fromName)}&toName=${encodeURIComponent(toName)}`),
  tollReconciliation: () => request('/toll/reconciliation'),
  tollReconciliationById: (id: string) => request(`/toll/reconciliation/${id}`),
  fastagAccounts: () => request('/fasttag/accounts'),
  fastagTransactions: (vehicleId?: string, matched?: string) => {
    const params = new URLSearchParams();
    if (vehicleId) params.set('vehicleId', vehicleId);
    if (matched !== undefined) params.set('matched', matched);
    return request(`/fasttag/transactions?${params.toString()}`);
  },
  fastagSync: () => request('/fasttag/sync', { method: 'POST' }),
  fastagSaveSettings: (data: object) => request('/fasttag/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  fastagLinkTrip: (txnId: string, tripId: string) => request(`/fasttag/link/${txnId}`, { method: 'PATCH', body: JSON.stringify({ tripId }) }),
  tyres: () => request('/tyres'),
  addTyre: (data: object) => request('/tyres', { method: 'POST', body: JSON.stringify(data) }),
  updateTyre: (id: string, data: object) => request(`/tyres/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  payFleetEMI: (vehicleId: string) => request(`/fleet/${vehicleId}/emi-payment`, { method: 'PATCH' }),
  fastagAddAccount: (data: object) => request('/fasttag/accounts', { method: 'POST', body: JSON.stringify(data) }),
  fastagEditAccount: (vehicleId: string, data: object) => request(`/fasttag/accounts/${vehicleId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  pettyCash: () => request('/petty-cash'),
  reconcilePettyCash: (id: string, data: object) =>
    request(`/petty-cash/${id}/reconcile`, { method: 'PATCH', body: JSON.stringify(data) }),
  issuePettyCash: (data: object) =>
    request('/petty-cash', { method: 'POST', body: JSON.stringify(data) }),
  transferPettyCash: (id: string) => request(`/petty-cash/${id}/transfer`, { method: 'PATCH' }),
  payoutPool: () => request('/payouts/pool'),
  loadPayoutPool: (amount: number) => request('/payouts/pool/load', { method: 'POST', body: JSON.stringify({ amount }) }),
  updateDriverBankDetails: (id: string, data: object) =>
    request(`/drivers/${id}/bank-details`, { method: 'PATCH', body: JSON.stringify(data) }),
  verifyRC: (vehicleId: string) => request(`/verify/rc/${vehicleId}`, { method: 'POST' }),
  verifyDL: (driverId: string) => request(`/verify/dl/${driverId}`, { method: 'POST' }),
  verifyPAN: (driverId: string) => request(`/verify/pan/${driverId}`, { method: 'POST' }),
  verificationLog: () => request('/verify/log'),
  spares: () => request('/spares'),
  sparesLedger: () => request('/spares/ledger'),
  addSparePart: (data: object) => request('/spares', { method: 'POST', body: JSON.stringify(data) }),
  updateSparePart: (id: string, data: object) => request(`/spares/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  spareStockIn: (id: string, data: object) => request(`/spares/${id}/stock-in`, { method: 'POST', body: JSON.stringify(data) }),
  spareIssue: (id: string, data: object) => request(`/spares/${id}/issue`, { method: 'POST', body: JSON.stringify(data) }),
};
