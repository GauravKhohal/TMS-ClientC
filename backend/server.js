require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { vehicles, drivers, trips, fuelEntries, maintenanceRecords, complianceRecords, alerts, users, costings, analytics, tollRoutes, tollReconciliations, pettyCash, fastagAccounts, fastagTransactions, tyres, verificationLog, spareParts, spareLedger, payoutPool, consignments } = require('./data/mockData');
const indianCities = require('./data/indianCities');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// Persistent store for users/vehicles/drivers/trips/fuel/maintenance/compliance/
// consignments/audit log/petty cash/FASTag/spares/tyres/payout pool. Alerts, login
// history, page visits, costing, and toll reconciliation remain in-memory mock data
// for now — migrate incrementally if/when they need to survive a restart.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Fields that exist on the mock vehicle/driver records but not yet as Postgres
// columns — preserved across the DB load below so EMI tracking, purchase-date
// filters, and TP verification keep working until these are migrated to the DB.
const VEHICLE_MOCK_ONLY_FIELDS = ['purchaseDate', 'loanAmount', 'loanTenureMonths', 'loanStartDate', 'emisPaid', 'emiHistory', 'rcVerification'];
const DRIVER_MOCK_ONLY_FIELDS = ['dlVerification', 'panVerification'];

function pickFields(obj, fields) {
  const out = {};
  fields.forEach(f => { if (obj && obj[f] !== undefined) out[f] = obj[f]; });
  return out;
}

// Replaces the in-memory arrays' contents (in place, since routes elsewhere hold
// references to these `const` arrays) with rows loaded from Postgres at boot.
async function loadFromDatabase() {
  const [dbUsers, dbVehicles, dbDrivers, dbTrips, dbFuelEntries, dbMaintenanceRecords, dbComplianceRecords, dbConsignments,
    dbPettyCash, dbFastagAccounts, dbFastagTransactions, dbPayoutPool, dbSpareParts, dbSpareLedger, dbTyres] = await Promise.all([
    prisma.user.findMany(),
    prisma.vehicle.findMany(),
    prisma.driver.findMany(),
    prisma.trip.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.fuelEntry.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.maintenanceRecord.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.complianceRecord.findMany(),
    prisma.consignment.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.pettyCash.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.fastagAccount.findMany(),
    prisma.fastagTransaction.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.payoutPool.findUnique({ where: { id: 'singleton' } }),
    prisma.sparePart.findMany(),
    prisma.spareLedgerEntry.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.tyre.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);
  // DB is always authoritative — no fallback to mock data
  users.splice(0, users.length, ...dbUsers);
  vehicles.splice(0, vehicles.length, ...dbVehicles.map(({ driverId, ...v }) => ({ ...v, driver: driverId })));
  drivers.splice(0, drivers.length, ...dbDrivers);
  trips.splice(0, trips.length, ...dbTrips);
  fuelEntries.splice(0, fuelEntries.length, ...dbFuelEntries);
  maintenanceRecords.splice(0, maintenanceRecords.length, ...dbMaintenanceRecords);
  complianceRecords.splice(0, complianceRecords.length, ...dbComplianceRecords);
  consignments.splice(0, consignments.length, ...dbConsignments);
  pettyCash.splice(0, pettyCash.length, ...dbPettyCash);
  fastagAccounts.splice(0, fastagAccounts.length, ...dbFastagAccounts);
  fastagTransactions.splice(0, fastagTransactions.length, ...dbFastagTransactions);
  spareParts.splice(0, spareParts.length, ...dbSpareParts);
  spareLedger.splice(0, spareLedger.length, ...dbSpareLedger);
  tyres.splice(0, tyres.length, ...dbTyres);

  // Payout pool is a single settings-style row — seed it on first boot, same as
  // the admin user below, instead of letting it silently start at all-zeros.
  if (dbPayoutPool) {
    Object.assign(payoutPool, dbPayoutPool);
  } else {
    try { await prisma.payoutPool.create({ data: { id: 'singleton', ...payoutPool } }); }
    catch (e) { console.error('Payout pool seed failed:', e.message); }
  }

  // Auto-seed admin on first boot so login works even on a fresh database
  if (users.length === 0) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('tms@1234', 10);
    const admin = { id: 'U001', name: 'Admin User', email: 'admin@tms.in', password: hash, role: 'Super Admin', status: 'Active', lastLogin: null, permissions: ['all'] };
    users.push(admin);
    try { await prisma.user.upsert({ where: { email: admin.email }, update: {}, create: admin }); }
    catch (e) { console.error('Admin seed failed:', e.message); }
    console.log('First boot: seeded default admin user (admin@tms.in)');
  }

  // One-time backfill: if the audit log table is still empty and a legacy JSON file
  // happens to exist on this container, import it so existing history isn't lost on
  // the cutover to Postgres. Safe to ship permanently — it's a no-op once the table
  // has any rows, and harmless if the legacy file was never present.
  try {
    const auditCount = await prisma.auditLogEntry.count();
    if (auditCount === 0 && fs.existsSync(AUDIT_FILE)) {
      const legacy = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
      if (Array.isArray(legacy) && legacy.length > 0) {
        await prisma.auditLogEntry.createMany({
          data: legacy.map(e => ({
            timestamp: new Date(e.timestamp), userId: e.userId, userName: e.userName,
            role: e.role, action: e.action, details: e.details ?? {},
          })),
        });
        console.log(`Backfilled ${legacy.length} audit log entries from legacy JSON file`);
      }
    }
  } catch (e) { console.error('Audit log backfill failed:', e.message); }

  console.log(`Loaded from database: ${users.length} users, ${vehicles.length} vehicles, ${drivers.length} drivers, ${trips.length} trips, ${fuelEntries.length} fuel entries, ${maintenanceRecords.length} maintenance records, ${complianceRecords.length} compliance records, ${consignments.length} consignments, ${pettyCash.length} petty cash entries, ${fastagAccounts.length} fastag accounts, ${fastagTransactions.length} fastag transactions, ${spareParts.length} spare parts, ${spareLedger.length} spare ledger entries, ${tyres.length} tyres`);
}

// Picks exactly the columns the Trip table has, so create/update calls don't choke
// on extra UI-only fields the frontend may send alongside a trip payload.
function tripDbFields(t) {
  return {
    voucherNo: t.voucherNo, origin: t.origin, destination: t.destination, stops: t.stops, viaStops: t.viaStops,
    status: t.status, approvalStatus: t.approvalStatus, rejectionReason: t.rejectionReason, driverId: t.driverId,
    vehicleId: t.vehicleId, customer: t.customer, customerType: t.customerType ?? 'Market', contactPerson: t.contactPerson, contactNo: t.contactNo,
    address: t.address, category: t.category, segment: t.segment, businessGroup: t.businessGroup,
    employeeId: t.employeeId, placementDate: t.placementDate, noOfVehicles: t.noOfVehicles,
    // cargo is a required legacy column the frontend never actually populates
    // (it only sends `content`) — default it so trip creation doesn't fail.
    vehicleLoadType: t.vehicleLoadType, cargo: t.cargo ?? t.content ?? '', content: t.content, rateType: t.rateType,
    weight: t.weight, packages: t.packages, rate: t.rate, freight: t.freight, loadingCharges: t.loadingCharges,
    unloadingCharges: t.unloadingCharges, otherCharges: t.otherCharges, commission: t.commission, advance: t.advance,
    paymentTerms: t.paymentTerms, creditDays: t.creditDays, total: t.total, balance: t.balance, volume: t.volume,
    plannedDate: t.plannedDate, actualDeparture: t.actualDeparture, eta: t.eta, distance: t.distance,
    approxTimeHrs: t.approxTimeHrs, plannedKm: t.plannedKm, actualKm: t.actualKm, tollCost: t.tollCost,
    fuelCost: t.fuelCost, revenue: t.revenue, pod: t.pod, delay: t.delay, notes: t.notes ?? null,
    placementConfirmed: t.placementConfirmed ?? false, placementDateTime: t.placementDateTime ?? null,
    placementRemarks: t.placementRemarks ?? null, cnNumber: t.cnNumber ?? null, cnDate: t.cnDate ?? null,
    consigneeName: t.consigneeName ?? null, consigneeAddress: t.consigneeAddress ?? null,
    consigneeContact: t.consigneeContact ?? null,
  };
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required — refusing to start with a guessable default.');
}
const JWT_SECRET = process.env.JWT_SECRET;

// No wildcard: '*' combined with credentials is rejected by browsers anyway, and
// silently allowing all origins in production would undo CORS protection entirely.
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
};

// Super Admin always passes; other roles must be explicitly listed per route
const requireRole = (...roles) => (req, res, next) => {
  if (req.user.role === 'Super Admin' || roles.includes(req.user.role)) return next();
  res.status(403).json({ error: 'Insufficient permissions for this action' });
};

// In-memory activity tracking (resets on restart — sufficient for MVP monitoring)
const loginHistory = []; // { id, userId, userName, role, email, timestamp, ip }
const pageVisits   = {}; // { userId: { '/fleet': 4, '/dashboard': 9, ... } }
const MAX_LOGIN_HISTORY = 500;
const MAX_FLEET_SIZE = 200; // mirrors frontend/app/(dashboard)/fleet/page.tsx

// Append-only audit trail for sensitive actions — who changed what, and when.
// Persisted to Postgres (not a local file) so it survives container restarts/redeploys.
const AUDIT_FILE = path.join(__dirname, 'data', 'auditLog.json'); // legacy file, read once for backfill only
const MAX_AUDIT_ENTRIES = 5000;

function logAudit(req, action, details) {
  const entry = {
    timestamp: new Date(),
    userId: req.user.id,
    userName: req.user.name,
    role: req.user.role,
    action,
    details,
  };
  // Fire-and-forget, consistent with the persistence pattern used elsewhere in this
  // file — logging a failure here must never block or fail the request it's attached to.
  prisma.auditLogEntry.create({ data: entry }).catch(e => console.error('Audit log write failed:', e.message));
}

// ── WhatsApp trip-approval notification (Meta WhatsApp Cloud API) ───────────
// Sends the driver a Hindi summary of the journey once a Fleet Manager approves
// the trip. Configure WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID in backend/.env
// (see developers.facebook.com -> your app -> WhatsApp -> API Setup).

function toWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 10 ? `91${digits}` : digits; // assume Indian numbers without country code
}

function formatTripDateHindi(dateStr) {
  if (!dateStr) return 'जल्द ही';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('hi-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function buildTripApprovalMessageHindi(trip, driver, vehicle) {
  const stops = (trip.stops && trip.stops.length) ? `\n🛑 स्टॉप: ${trip.stops.join(', ')}` : '';
  return [
    `🚛 *यात्रा स्वीकृत — यात्रा विवरण*`,
    ``,
    `नमस्ते ${driver?.name || 'ड्राइवर'} जी,`,
    `आपकी यात्रा (${trip.voucherNo || trip.id}) स्वीकृत कर दी गई है। संक्षिप्त विवरण:`,
    ``,
    `📍 मार्ग: ${trip.origin} → ${trip.destination}${stops}`,
    `🚚 वाहन नंबर: ${vehicle?.regNumber || trip.vehicleId}`,
    `📦 माल: ${trip.cargo || '-'}${trip.weight ? ` (${trip.weight} टन)` : ''}`,
    `👤 ग्राहक: ${trip.customer || '-'}`,
    `📅 प्रस्थान तिथि: ${formatTripDateHindi(trip.plannedDate)}`,
    `🎯 अनुमानित पहुंच तिथि: ${formatTripDateHindi(trip.eta)}`,
    `🛣️ कुल दूरी: ${trip.distance ? `${trip.distance} किमी` : '-'}`,
    ``,
    `कृपया समय पर रवाना हों और सुरक्षित यात्रा करें। धन्यवाद।`,
  ].join('\n');
}

async function sendWhatsAppMessage(toPhone, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = toWhatsAppNumber(toPhone);

  if (!token || !phoneNumberId) return { sent: false, reason: 'WhatsApp API not configured (missing WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID)' };
  if (!to) return { sent: false, reason: 'Driver has no valid phone number' };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
    });
    const data = await res.json();
    if (!res.ok) return { sent: false, reason: data?.error?.message || `WhatsApp API error (${res.status})` };
    return { sent: true, messageId: data?.messages?.[0]?.id };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

async function notifyDriverOfApprovedTrip(trip) {
  const driver = drivers.find(d => d.id === trip.driverId) || drivers.find(d => d.id === vehicles.find(v => v.id === trip.vehicleId)?.driver);
  if (!driver) return { sent: false, reason: 'No driver assigned to this trip/vehicle' };
  const vehicle = vehicles.find(v => v.id === trip.vehicleId);
  const message = buildTripApprovalMessageHindi(trip, driver, vehicle);
  const result = await sendWhatsAppMessage(driver.phone, message);
  if (!result.sent) console.error(`WhatsApp message to driver ${driver.id} (${driver.name}) not sent:`, result.reason);
  return { ...result, driverName: driver.name, driverPhone: driver.phone, message };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

// Auth
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password || '', user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.status !== 'Active') return res.status(403).json({ error: 'Account is inactive' });
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  loginHistory.push({ id: Date.now().toString(), userId: user.id, userName: user.name, role: user.role, email: user.email, timestamp: new Date().toISOString(), ip });
  if (loginHistory.length > MAX_LOGIN_HISTORY) loginHistory.splice(0, loginHistory.length - MAX_LOGIN_HISTORY);
  // also persist login to the audit trail so it survives restarts
  const fakeReq = { user: { id: user.id, name: user.name, role: user.role }, headers: req.headers, socket: req.socket };
  logAudit(fakeReq, 'auth.login', { email: user.email, ip });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Dashboard summary
app.get('/api/dashboard', auth, (req, res) => {
  const activeTrips = trips.filter(t => t.status === 'In Transit').length;
  const totalRevenue = trips.filter(t => t.status === 'Completed').reduce((s, t) => s + t.revenue, 0);
  const activeVehicles = vehicles.filter(v => v.status === 'Running').length;
  const unreadAlerts = alerts.filter(a => !a.read).length;
  const indentStats = {
    total: trips.length,
    pending: trips.filter(t => t.approvalStatus === 'Pending Approval').length,
    approved: trips.filter(t => t.approvalStatus === 'Approved').length,
    rejected: trips.filter(t => t.approvalStatus === 'Rejected').length,
  };
  res.json({ totalVehicles: vehicles.length, activeVehicles, activeTrips, totalRevenue, totalDrivers: drivers.length, unreadAlerts, fleetStatus: analytics.fleetStatus, monthlyRevenue: analytics.monthlyRevenue, indentStats });
});

// Fleet
app.get('/api/fleet', auth, (req, res) => res.json(vehicles));
app.get('/api/fleet/:id', auth, (req, res) => {
  const v = vehicles.find(v => v.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'Vehicle not found' });
  const driver = drivers.find(d => d.id === v.driver);
  res.json({ ...v, driverDetails: driver });
});
app.post('/api/fleet', auth, requireRole('Fleet Manager'), async (req, res) => {
  if (vehicles.length >= MAX_FLEET_SIZE) return res.status(400).json({ error: `Fleet limit of ${MAX_FLEET_SIZE} vehicles reached` });
  const { regNumber, make, model, year, category, ownershipType, capacity, fuelType,
    insurance, fitness, permit, odometer, purchaseDate, purchasedAgency, vehicleValue,
    emiEnabled, monthlyEMI, loanBank, loanAmount, loanTenureMonths, loanStartDate } = req.body;
  if (!regNumber || !make || !model) return res.status(400).json({ error: 'Registration number, make, and model are required' });
  const newVehicle = {
    id: 'V' + Date.now(),
    regNumber, make, model, year: Number(year) || new Date().getFullYear(),
    category: category || 'Heavy', ownershipType: ownershipType || 'Own', capacity: capacity || '', fuelType: fuelType || 'Diesel',
    status: 'Idle', driver: null, odometer: Number(odometer) || 0, location: { lat: 18.52, lng: 73.85 }, speed: 0,
    lastService: '', insurance: insurance || '', fitness: fitness || '', permit: permit || '',
    utilization: 0, purchasedAgency: purchasedAgency || '', vehicleValue: Number(vehicleValue) || 0,
    emiEnabled: emiEnabled || 'No', monthlyEMI: Number(monthlyEMI) || 0, loanBank: loanBank || '',
    // Mock-only fields, no Postgres column yet (see VEHICLE_MOCK_ONLY_FIELDS) —
    // kept in-memory only, same as driver verification fields.
    purchaseDate: purchaseDate || '', loanAmount: Number(loanAmount) || 0,
    loanTenureMonths: Number(loanTenureMonths) || 0, loanStartDate: loanStartDate || '',
    emisPaid: 0, emiHistory: [],
    rcVerification: { status: 'Not Verified', lastChecked: null, refId: null, source: 'Parivahan (VAHAN)', details: null },
  };
  try {
    await prisma.vehicle.create({ data: {
      id: newVehicle.id, regNumber: newVehicle.regNumber, make: newVehicle.make, model: newVehicle.model,
      year: newVehicle.year, category: newVehicle.category, ownershipType: newVehicle.ownershipType,
      capacity: newVehicle.capacity, fuelType: newVehicle.fuelType, status: newVehicle.status,
      driverId: null, odometer: newVehicle.odometer, location: newVehicle.location, speed: newVehicle.speed,
      lastService: newVehicle.lastService, insurance: newVehicle.insurance, fitness: newVehicle.fitness,
      permit: newVehicle.permit, utilization: newVehicle.utilization, purchasedAgency: newVehicle.purchasedAgency,
      vehicleValue: newVehicle.vehicleValue, emiEnabled: newVehicle.emiEnabled, monthlyEMI: newVehicle.monthlyEMI,
      loanBank: newVehicle.loanBank,
    }});
  } catch (e) {
    console.error('Failed to persist vehicle:', e.message);
    return res.status(500).json({ error: 'Failed to save vehicle. Please try again.' });
  }
  vehicles.unshift(newVehicle);
  logAudit(req, 'fleet.add', { vehicleId: newVehicle.id, regNumber: newVehicle.regNumber });
  res.json(newVehicle);
});

app.patch('/api/fleet/:id/emi-payment', auth, (req, res) => {
  const v = vehicles.find(v => v.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'Vehicle not found' });
  if (v.emiEnabled !== 'Yes') return res.status(400).json({ error: 'Vehicle has no EMI' });
  if ((v.emisPaid || 0) >= (v.loanTenureMonths || 0)) return res.status(400).json({ error: 'Loan already fully paid' });
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const history = v.emiHistory || [];
  if (history.some(h => h.month === monthKey)) return res.status(400).json({ error: `EMI for ${monthKey} already submitted` });
  v.emisPaid = (v.emisPaid || 0) + 1;
  history.push({ month: monthKey, date: now.toISOString().split('T')[0], amount: v.monthlyEMI });
  v.emiHistory = history;
  logAudit(req, 'fleet.emi_payment', { vehicleId: v.id, regNumber: v.regNumber, month: monthKey, amount: v.monthlyEMI, emisPaid: v.emisPaid });
  res.json({ success: true, vehicle: v });
});

// Drivers
app.get('/api/drivers', auth, (req, res) => res.json(drivers));
app.get('/api/drivers/:id', auth, (req, res) => {
  const d = drivers.find(d => d.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Driver not found' });
  const driverTrips = trips.filter(t => t.driverId === d.id);
  res.json({ ...d, trips: driverTrips });
});

app.post('/api/drivers', auth, requireRole('Fleet Manager', 'Dispatcher'), async (req, res) => {
  const { name, phone, altPhone, dob, address, dlNumber, licenseCategory, licenseExpiry,
          experience, emergencyContact, salary, aadhaarNumber, panNumber, supervisorName, photo } = req.body;
  if (!name || !phone || !dob) return res.status(400).json({ error: 'Name, phone, and DOB are required' });
  const ymNow = new Date().toISOString().slice(0, 7);
  const newDriver = {
    id: 'D' + Date.now(), name, phone, altPhone: altPhone || '', dob,
    address: address || '', dlNumber: dlNumber || '', licenseCategory: licenseCategory || 'HMV',
    licenseExpiry: licenseExpiry || '', experience: parseInt(experience) || 0,
    emergencyContact: emergencyContact || '', salary: parseInt(salary) || 0, advance: 0,
    aadhaarNumber: aadhaarNumber || '', panNumber: panNumber || '',
    supervisorName: supervisorName || 'Self',
    supervisorHistory: [{ supervisor: supervisorName || 'Self', fromMonth: ymNow, toMonth: null }],
    bankDetails: { bankName: '', accountNumber: '', ifsc: '', upiId: '' },
    status: 'Active', assignedVehicle: null,
    fuelScore: 0, safetyScore: 0, onTimeDelivery: 0, customerRating: 0,
    totalTrips: 0, totalKm: 0, violations: 0, attendance: 100,
    dlVerification: { status: 'Not Verified', lastChecked: null, refId: null, source: 'Parivahan (Sarathi)', details: null },
    panVerification: { status: 'Not Verified', lastChecked: null, refId: null, source: 'NSDL e-Gov', details: null },
    photo: photo || null,
  };
  try {
    await prisma.driver.create({ data: {
      id: newDriver.id, name: newDriver.name, phone: newDriver.phone, altPhone: newDriver.altPhone,
      dob: newDriver.dob, address: newDriver.address, dlNumber: newDriver.dlNumber,
      licenseCategory: newDriver.licenseCategory, licenseExpiry: newDriver.licenseExpiry,
      experience: newDriver.experience, emergencyContact: newDriver.emergencyContact,
      salary: newDriver.salary, advance: 0, aadhaarNumber: newDriver.aadhaarNumber,
      panNumber: newDriver.panNumber, supervisorName: newDriver.supervisorName,
      supervisorHistory: newDriver.supervisorHistory, bankDetails: newDriver.bankDetails,
      status: 'Active', assignedVehicle: null,
      fuelScore: 0, safetyScore: 0, onTimeDelivery: 0, customerRating: 0,
      totalTrips: 0, totalKm: 0, violations: 0, attendance: 100,
      // dlVerification/panVerification have no Postgres column yet (see
      // DRIVER_MOCK_ONLY_FIELDS) — kept in-memory only, like the rest of that set.
      photo: newDriver.photo,
    }});
  } catch (e) {
    console.error('Failed to persist driver:', e.message);
    return res.status(500).json({ error: 'Failed to save driver. Please try again.' });
  }
  drivers.unshift(newDriver);
  logAudit(req, 'driver.add', { driverId: newDriver.id, name: newDriver.name });
  res.json(newDriver);
});

app.patch('/api/drivers/:id/photo', auth, requireRole('Fleet Manager', 'Dispatcher'), async (req, res) => {
  const driver = drivers.find(d => d.id === req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  const photo = req.body.photo || null;
  try { await prisma.driver.update({ where: { id: driver.id }, data: { photo } }); }
  catch (e) {
    console.error('Failed to persist driver photo:', e.message);
    return res.status(500).json({ error: 'Failed to save photo. Please try again.' });
  }
  driver.photo = photo;
  logAudit(req, 'driver.photo.update', { driverId: driver.id, driverName: driver.name });
  res.json({ success: true, photo: driver.photo });
});

app.patch('/api/drivers/:id/bank-details', auth, requireRole('Accountant', 'Fleet Manager'), async (req, res) => {
  const driver = drivers.find(d => d.id === req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  const { bankName, accountNumber, ifsc, upiId } = req.body;
  const bankDetails = {
    bankName: bankName || '', accountNumber: accountNumber || '',
    ifsc: ifsc || '', upiId: upiId || '',
  };
  try { await prisma.driver.update({ where: { id: driver.id }, data: { bankDetails } }); }
  catch (e) {
    console.error('Failed to persist driver bank details:', e.message);
    return res.status(500).json({ error: 'Failed to save bank details. Please try again.' });
  }
  driver.bankDetails = bankDetails;
  logAudit(req, 'driver.bank_details.update', { driverId: driver.id, driverName: driver.name });
  res.json({ success: true, driver });
});

// Trips
app.get('/api/trips', auth, (req, res) => res.json(trips));
app.get('/api/trips/:id', auth, (req, res) => {
  const t = trips.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Trip not found' });
  const driver = drivers.find(d => d.id === t.driverId);
  const vehicle = vehicles.find(v => v.id === t.vehicleId);
  res.json({ ...t, driverDetails: driver, vehicleDetails: vehicle });
});

app.post('/api/trips', auth, requireRole('Fleet Manager', 'Dispatcher'), async (req, res) => {
  const data = req.body;
  const newTrip = {
    ...data,
    id: 'T' + String(trips.length + 1).padStart(3, '0'),
    voucherNo: 'T' + String(trips.length + 1).padStart(3, '0'),
    status: 'Pending Approval',
    approvalStatus: 'Pending Approval',
    rejectionReason: '',
    actualDeparture: null, actualKm: 0, tollCost: 0, fuelCost: 0, pod: false, delay: 0,
    stops: (data.viaStops || []).map(s => s.city),
  };
  try { await prisma.trip.create({ data: { id: newTrip.id, ...tripDbFields(newTrip) } }); }
  catch (e) {
    console.error('Failed to persist new trip:', e.message);
    return res.status(500).json({ error: 'Failed to create trip. Please try again.' });
  }
  trips.unshift(newTrip);
  logAudit(req, 'trip.create', { tripId: newTrip.id, origin: newTrip.origin, destination: newTrip.destination, customer: newTrip.customer, vehicleId: newTrip.vehicleId, driverId: newTrip.driverId, freight: newTrip.freight });
  res.json({ success: true, trip: newTrip });
});

app.patch('/api/trips/:id', auth, requireRole('Fleet Manager', 'Dispatcher'), async (req, res) => {
  const trip = trips.find(t => t.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const FINANCIAL_FIELDS = ['freight','loadingCharges','unloadingCharges','otherCharges','commission','advance','rate'];
  const before = FINANCIAL_FIELDS.reduce((o, k) => ({ ...o, [k]: trip[k] }), {});
  const allowed = ['customer','customerType','contactPerson','contactNo','address','category','segment','businessGroup',
    'vehicleLoadType','noOfVehicles','content','rateType','weight','packages','rate',
    'freight','loadingCharges','unloadingCharges','otherCharges','commission',
    'advance','paymentTerms','creditDays','total','balance',
    'vehicleId','driverId','plannedDate','eta','distance','approxTimeHrs','viaStops','stops','notes'];
  const updated = { ...trip };
  allowed.forEach(k => { if (req.body[k] !== undefined) updated[k] = req.body[k]; });
  updated.total   = updated.freight + updated.loadingCharges + updated.unloadingCharges + updated.otherCharges - updated.commission;
  updated.balance = updated.total - updated.advance;
  try { await prisma.trip.update({ where: { id: trip.id }, data: tripDbFields(updated) }); }
  catch (e) {
    console.error('Failed to persist trip edit:', e.message);
    return res.status(500).json({ error: 'Failed to save changes. Please try again.' });
  }
  Object.assign(trip, updated);
  const after = FINANCIAL_FIELDS.reduce((o, k) => ({ ...o, [k]: trip[k] }), {});
  const changed = FINANCIAL_FIELDS.filter(k => before[k] !== after[k]);
  logAudit(req, 'trip.edit', { tripId: trip.id, fields: Object.keys(req.body), ...(changed.length ? { financialChanges: changed.map(k => ({ field: k, before: before[k], after: after[k] })) } : {}) });
  res.json({ success: true, trip });
});

app.patch('/api/trips/:id/approve', auth, requireRole('Fleet Manager'), async (req, res) => {
  const trip = trips.find(t => t.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  try { await prisma.trip.update({ where: { id: trip.id }, data: { approvalStatus: 'Approved', status: 'Planned' } }); }
  catch (e) {
    console.error('Failed to persist trip approval:', e.message);
    return res.status(500).json({ error: 'Failed to approve trip. Please try again.' });
  }
  trip.approvalStatus = 'Approved';
  trip.status = 'Planned';
  logAudit(req, 'trip.approve', { tripId: trip.id, customer: trip.customer });

  const whatsapp = await notifyDriverOfApprovedTrip(trip);
  logAudit(req, 'trip.driver_notification', { tripId: trip.id, driverName: whatsapp.driverName, sent: whatsapp.sent, reason: whatsapp.reason });

  res.json({ success: true, trip, driverNotification: { sent: whatsapp.sent, reason: whatsapp.reason, driverName: whatsapp.driverName, driverPhone: whatsapp.driverPhone, message: whatsapp.message } });
});

app.patch('/api/trips/:id/reject', auth, requireRole('Fleet Manager'), async (req, res) => {
  const trip = trips.find(t => t.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });
  try { await prisma.trip.update({ where: { id: trip.id }, data: { approvalStatus: 'Rejected', status: 'Cancelled', rejectionReason: reason } }); }
  catch (e) {
    console.error('Failed to persist trip rejection:', e.message);
    return res.status(500).json({ error: 'Failed to reject trip. Please try again.' });
  }
  trip.approvalStatus = 'Rejected';
  trip.status = 'Cancelled';
  trip.rejectionReason = reason;
  logAudit(req, 'trip.reject', { tripId: trip.id, customer: trip.customer, reason });
  res.json({ success: true, trip });
});

app.patch('/api/trips/:id/placement', auth, requireRole('Fleet Manager', 'Dispatcher'), async (req, res) => {
  const trip = trips.find(t => t.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const { vehicleId, driverId, placementDateTime, placementRemarks } = req.body;
  if (!vehicleId || !driverId || !placementDateTime) {
    return res.status(400).json({ error: 'Vehicle, driver and placement date/time are required' });
  }
  const remarks = placementRemarks || '';
  try {
    await prisma.trip.update({ where: { id: trip.id }, data: {
      vehicleId, driverId, placementDateTime, placementRemarks: remarks, placementConfirmed: true,
    }});
  } catch (e) {
    console.error('Failed to persist trip placement:', e.message);
    return res.status(500).json({ error: 'Failed to save placement. Please try again.' });
  }
  trip.vehicleId = vehicleId;
  trip.driverId = driverId;
  trip.placementDateTime = placementDateTime;
  trip.placementRemarks = remarks;
  trip.placementConfirmed = true;
  logAudit(req, 'trip.placement', { tripId: trip.id, vehicleId, driverId, placementDateTime });
  res.json({ success: true, trip });
});

app.patch('/api/trips/:id/cn', auth, requireRole('Fleet Manager', 'Dispatcher'), async (req, res) => {
  const trip = trips.find(t => t.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (!trip.placementConfirmed) return res.status(400).json({ error: 'Vehicle placement must be confirmed before generating a CN' });
  const { consigneeName, consigneeAddress, consigneeContact } = req.body;
  if (!consigneeName || !consigneeAddress) return res.status(400).json({ error: 'Consignee name and address are required' });
  const contact   = consigneeContact || '';
  const cnNumber  = trip.cnNumber || ('CN' + trip.id.slice(1));
  const cnDate    = trip.cnDate   || new Date().toISOString().split('T')[0];
  try {
    await prisma.trip.update({ where: { id: trip.id }, data: {
      consigneeName, consigneeAddress, consigneeContact: contact, cnNumber, cnDate,
    }});
  } catch (e) {
    console.error('Failed to persist trip CN:', e.message);
    return res.status(500).json({ error: 'Failed to save CN. Please try again.' });
  }
  trip.consigneeName = consigneeName;
  trip.consigneeAddress = consigneeAddress;
  trip.consigneeContact = contact;
  trip.cnNumber = cnNumber;
  trip.cnDate = cnDate;
  logAudit(req, 'trip.cn_generate', { tripId: trip.id, cnNumber: trip.cnNumber });
  res.json({ success: true, trip });
});

// Consignments
app.get('/api/consignments', auth, (req, res) => res.json(consignments));

app.post('/api/consignments', auth, requireRole('Fleet Manager', 'Dispatcher'), async (req, res) => {
  const { docType, against, againstNo, vehicleId, source, destination,
    consignor, consignorLocation, consignorGstin,
    consignee, consigneeLocation, consigneeGstin,
    billingParty, billingPartyLocation, billingPartyGstin,
    deliveryAt, loadType, paymentTerms, mode, godown,
    containerNo, sealNo, markNo, expectedDelivery, transporter,
    items } = req.body;

  if (!vehicleId || !source || !destination || !consignor || !consignee) {
    return res.status(400).json({ error: 'Vehicle, source, destination, consignor and consignee are required' });
  }

  const today = new Date();
  const cnDate = today.toISOString().split('T')[0];
  const cnNumber = `CN${today.getFullYear().toString().slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}${Date.now().toString().slice(-6)}`;

  const lineItems = Array.isArray(items) ? items : [];
  const totalWeight  = lineItems.reduce((s, i) => s + (parseFloat(i.weight)  || 0), 0);
  const totalFreight = lineItems.reduce((s, i) => s + (parseInt(i.freight)   || 0), 0);

  const newCn = {
    id: 'C' + Date.now(),
    cnNumber, cnDate, docType: docType || 'OEM CN',
    against: against || 'PLACEMENT', againstNo: againstNo || '',
    vehicleId, source, destination,
    consignor, consignorLocation: consignorLocation || '', consignorGstin: consignorGstin || '',
    consignee, consigneeLocation: consigneeLocation || '', consigneeGstin: consigneeGstin || '',
    billingParty: billingParty || consignor,
    billingPartyLocation: billingPartyLocation || '', billingPartyGstin: billingPartyGstin || '',
    deliveryAt: deliveryAt || 'DIRECT', loadType: loadType || '',
    paymentTerms: paymentTerms || 'CREDIT', mode: mode || 'ROAD',
    godown: godown || '', containerNo: containerNo || '', sealNo: sealNo || '',
    markNo: markNo || '', expectedDelivery: expectedDelivery || '',
    transporter: transporter || '', items: lineItems,
    totalWeight, totalFreight,
    createdBy: req.user?.name || 'System',
  };

  try { await prisma.consignment.create({ data: newCn }); }
  catch (e) {
    console.error('Failed to persist consignment:', e.message);
    return res.status(500).json({ error: 'Failed to save consignment. Please try again.' });
  }
  consignments.unshift(newCn);
  logAudit(req, 'consignment.create', { cnNumber, vehicleId, source, destination, consignor, consignee });

  // Mark the linked trip as CN-issued (backward compat with placement flow) — best
  // effort: a failure here doesn't roll back the consignment that was just saved.
  const trip = trips.find(t => t.id === againstNo || t.voucherNo === againstNo);
  if (trip && !trip.cnNumber) {
    try {
      await prisma.trip.update({ where: { id: trip.id }, data: { cnNumber, cnDate } });
      trip.cnNumber = cnNumber;
      trip.cnDate   = cnDate;
    } catch (e) { console.error('Failed to patch trip CN:', e.message); }
  }

  res.json(newCn);
});

// Fuel
app.get('/api/fuel', auth, (req, res) => res.json(fuelEntries));
app.get('/api/fuel/vehicle/:vehicleId', auth, (req, res) => res.json(fuelEntries.filter(f => f.vehicleId === req.params.vehicleId)));

app.post('/api/fuel', auth, requireRole('Fleet Manager', 'Dispatcher'), async (req, res) => {
  const { vehicleId, date, liters, pricePerLiter, odometer, station, fuelCardUsed, tripId } = req.body;
  if (!vehicleId || !date || !liters || !pricePerLiter || !odometer) {
    return res.status(400).json({ error: 'Vehicle, date, litres, price per litre and odometer are required' });
  }
  // KM/L is derived from the distance since this vehicle's last fill-up — 0 if
  // there's no prior reading to compare against (first entry for the vehicle).
  const previous = fuelEntries
    .filter(f => f.vehicleId === vehicleId && f.odometer < odometer)
    .sort((a, b) => b.odometer - a.odometer)[0];
  const kmpl = previous ? Math.round(((odometer - previous.odometer) / liters) * 10) / 10 : 0;

  const newEntry = {
    id: 'F' + Date.now(),
    vehicleId, date, liters, pricePerLiter,
    totalCost: Math.round(liters * pricePerLiter),
    odometer, kmpl,
    station: station || '',
    fuelCardUsed: !!fuelCardUsed,
    tripId: tripId || null,
  };
  try { await prisma.fuelEntry.create({ data: newEntry }); }
  catch (e) {
    console.error('Failed to persist fuel entry:', e.message);
    return res.status(500).json({ error: 'Failed to save fuel entry. Please try again.' });
  }
  fuelEntries.unshift(newEntry);
  logAudit(req, 'fuel.add', { entryId: newEntry.id, vehicleId, liters, totalCost: newEntry.totalCost });
  res.json(newEntry);
});

// Maintenance
app.get('/api/maintenance', auth, (req, res) => res.json(maintenanceRecords));

app.post('/api/maintenance', auth, requireRole('Fleet Manager', 'Dispatcher'), async (req, res) => {
  const { vehicleId, type, description, date, vendor, estimatedCompletion, cost, parts } = req.body;
  if (!vehicleId || !type || !description || !date) {
    return res.status(400).json({ error: 'Vehicle, type, description and date are required' });
  }

  const newRecord = {
    id: 'M' + Date.now(),
    vehicleId, type, description, date,
    status: 'Pending',
    cost: Math.round(Number(cost) || 0),
    vendor: vendor || '',
    estimatedCompletion: estimatedCompletion || '',
    parts: Array.isArray(parts) ? parts : [],
  };
  try { await prisma.maintenanceRecord.create({ data: newRecord }); }
  catch (e) {
    console.error('Failed to persist maintenance record:', e.message);
    return res.status(500).json({ error: 'Failed to save maintenance record. Please try again.' });
  }
  maintenanceRecords.unshift(newRecord);
  logAudit(req, 'maintenance.add', { recordId: newRecord.id, vehicleId, type, cost: newRecord.cost });
  res.json(newRecord);
});

// Compliance — status calculated live from expiry dates
// A record's docs default to an empty expiry (status "Not Set") until filled in
// via the Edit Compliance modal, so every vehicle always appears in the matrix.
function calcComplianceStatus(expiryStr) {
  if (!expiryStr) return { status: 'Not Set', daysLeft: null };
  const days = Math.ceil((new Date(expiryStr) - new Date()) / 86400000);
  if (days < 0)   return { status: 'Expired',       daysLeft: days };
  if (days <= 30)  return { status: 'Expiring Soon', daysLeft: days };
  if (days <= 90)  return { status: 'Due Soon',      daysLeft: days };
  return           { status: 'Valid',                daysLeft: days };
}

function computeComplianceRecord(vehicleId) {
  const r = complianceRecords.find(c => c.vehicleId === vehicleId) || {};
  return {
    vehicleId,
    rc:             { expiry: '',                  ...r.rc,             ...calcComplianceStatus((r.rc || {}).expiry) },
    insurance:      { expiry: '', provider: '',    ...r.insurance,      ...calcComplianceStatus((r.insurance || {}).expiry) },
    fitness:        { expiry: '',                  ...r.fitness,        ...calcComplianceStatus((r.fitness || {}).expiry) },
    pollution:      { expiry: '',                  ...r.pollution,      ...calcComplianceStatus((r.pollution || {}).expiry) },
    statePermit:    { expiry: '',                  ...r.statePermit,    ...calcComplianceStatus((r.statePermit || {}).expiry) },
    nationalPermit: { expiry: '',                  ...r.nationalPermit, ...calcComplianceStatus((r.nationalPermit || {}).expiry) },
  };
}

app.get('/api/compliance', auth, (req, res) => {
  res.json(vehicles.map(v => computeComplianceRecord(v.id)));
});

app.put('/api/compliance/:vehicleId', auth, requireRole('Fleet Manager'), async (req, res) => {
  const { vehicleId } = req.params;
  if (!vehicles.find(v => v.id === vehicleId)) return res.status(404).json({ error: 'Vehicle not found' });

  const { rc, insurance, fitness, pollution, statePermit, nationalPermit } = req.body;
  const record = {
    vehicleId,
    rc:             { expiry: rc?.expiry || '' },
    insurance:      { expiry: insurance?.expiry || '', provider: insurance?.provider || '' },
    fitness:        { expiry: fitness?.expiry || '' },
    pollution:      { expiry: pollution?.expiry || '' },
    statePermit:    { expiry: statePermit?.expiry || '' },
    nationalPermit: { expiry: nationalPermit?.expiry || '' },
  };

  try {
    const { vehicleId: _vid, ...data } = record;
    await prisma.complianceRecord.upsert({ where: { vehicleId }, create: record, update: data });
  } catch (e) {
    console.error('Failed to persist compliance record:', e.message);
    return res.status(500).json({ error: 'Failed to save compliance record. Please try again.' });
  }

  const idx = complianceRecords.findIndex(c => c.vehicleId === vehicleId);
  if (idx >= 0) complianceRecords[idx] = record; else complianceRecords.push(record);
  logAudit(req, 'compliance.update', { vehicleId });

  res.json(computeComplianceRecord(vehicleId));
});

// ── TP Verification (RC / DL / PAN via Parivahan / NSDL) ────────────────────
// Mock responses are shaped like real third-party verification APIs (Surepass/
// Karza/Digitap) so a real provider can be swapped in later without changing
// the response contract consumed by the frontend.
const RC_OUTCOMES  = { V001: 'Verified', V002: 'Verified', V003: 'Verified', V004: 'Mismatch', V005: 'Verified', V006: 'Verified', V007: 'Verified', V008: 'Failed' };
const DL_OUTCOMES  = { D001: 'Verified', D002: 'Verified', D003: 'Verified', D004: 'Verified', D005: 'Verified', D006: 'Mismatch', D007: 'Verified', D008: 'Failed' };
const PAN_OUTCOMES = { D001: 'Verified', D002: 'Verified', D003: 'Verified', D004: 'Verified', D005: 'Verified', D006: 'Verified', D007: 'Mismatch', D008: 'Failed' };

function buildRCDetails(v, outcome) {
  if (outcome === 'Failed') return { error: 'RC record not found in VAHAN database for this registration number.' };
  const base = {
    registrationNumber: v.regNumber,
    ownerName: 'TMS Logistics Pvt Ltd',
    registrationDate: v.purchaseDate,
    vehicleClass: `${v.category} Goods Vehicle`,
    fuelType: v.fuelType,
    chassisNumber: `MA${v.id}${v.year}CHS`,
    engineNumber: `ENG${v.year}${v.id}`,
    fitnessUpto: v.fitness,
    insuranceUpto: v.insurance,
    permitUpto: v.permit,
    rcStatus: 'Active',
    financer: v.emiEnabled === 'Yes' ? v.loanBank : 'None',
  };
  if (outcome === 'Mismatch') {
    return { ...base, financer: v.emiEnabled === 'Yes' ? 'Not on record' : base.financer, fuelType: 'CNG', mismatchFields: v.emiEnabled === 'Yes' ? ['fuelType', 'financer'] : ['fuelType'] };
  }
  return base;
}

function buildDLDetails(d, outcome) {
  if (outcome === 'Failed') return { error: 'DL record not found in Sarathi database for this license number.' };
  const base = {
    dlNumber: d.dlNumber,
    name: d.name,
    dob: d.dob,
    vehicleClasses: ['LMV', 'HMV', 'TRANS'],
    validUpto: d.licenseExpiry,
    issuingRTO: d.dlNumber.split('-').slice(0, 2).join('-'),
    dlStatus: 'Active',
  };
  if (outcome === 'Mismatch') {
    const parts = d.name.split(' ');
    return { ...base, name: `${parts[0]} ${parts[1] ? parts[1].charAt(0) + '.' : ''}`.trim(), mismatchFields: ['name'] };
  }
  return base;
}

function buildPANDetails(d, outcome) {
  if (outcome === 'Failed') return { error: 'PAN not found or invalid PAN number.' };
  const base = {
    panNumber: d.panNumber,
    nameOnPAN: d.name,
    panStatus: 'Valid',
    aadhaarSeedingStatus: 'Linked',
    category: 'Individual',
  };
  if (outcome === 'Mismatch') {
    return { ...base, nameOnPAN: d.name.toUpperCase(), aadhaarSeedingStatus: 'Not Linked', mismatchFields: ['nameOnPAN', 'aadhaarSeedingStatus'] };
  }
  return base;
}

function logVerification(req, type, entityId, entityName, status, refId, timestamp) {
  const entry = {
    id: 'VL' + String(verificationLog.length + 1).padStart(4, '0'),
    type, entityId, entityName, status, refId, timestamp,
    checkedBy: req.user.name,
  };
  verificationLog.unshift(entry);
  if (verificationLog.length > 500) verificationLog.length = 500;
}

app.get('/api/verify/log', auth, (req, res) => res.json(verificationLog));

app.post('/api/verify/rc/:vehicleId', auth, requireRole('Fleet Manager'), (req, res) => {
  const v = vehicles.find(v => v.id === req.params.vehicleId);
  if (!v) return res.status(404).json({ error: 'Vehicle not found' });
  const outcome = RC_OUTCOMES[v.id] || 'Verified';
  const refId = 'PAR-RC-' + Date.now().toString(36).toUpperCase();
  const timestamp = new Date().toISOString();
  v.rcVerification = { status: outcome, lastChecked: timestamp, refId, source: 'Parivahan', details: buildRCDetails(v, outcome) };
  logVerification(req, 'RC', v.id, v.regNumber, outcome, refId, timestamp);
  logAudit(req, 'verify.rc', { vehicleId: v.id, regNumber: v.regNumber, status: outcome, refId });
  res.json({ success: true, vehicleId: v.id, rcVerification: v.rcVerification });
});

app.post('/api/verify/dl/:driverId', auth, requireRole('Fleet Manager'), (req, res) => {
  const d = drivers.find(d => d.id === req.params.driverId);
  if (!d) return res.status(404).json({ error: 'Driver not found' });
  const outcome = DL_OUTCOMES[d.id] || 'Verified';
  const refId = 'PAR-DL-' + Date.now().toString(36).toUpperCase();
  const timestamp = new Date().toISOString();
  d.dlVerification = { status: outcome, lastChecked: timestamp, refId, source: 'Parivahan (Sarathi)', details: buildDLDetails(d, outcome) };
  logVerification(req, 'DL', d.id, d.name, outcome, refId, timestamp);
  logAudit(req, 'verify.dl', { driverId: d.id, name: d.name, status: outcome, refId });
  res.json({ success: true, driverId: d.id, dlVerification: d.dlVerification });
});

app.post('/api/verify/pan/:driverId', auth, requireRole('Fleet Manager'), (req, res) => {
  const d = drivers.find(d => d.id === req.params.driverId);
  if (!d) return res.status(404).json({ error: 'Driver not found' });
  const outcome = PAN_OUTCOMES[d.id] || 'Verified';
  const refId = 'NSDL-PAN-' + Date.now().toString(36).toUpperCase();
  const timestamp = new Date().toISOString();
  d.panVerification = { status: outcome, lastChecked: timestamp, refId, source: 'NSDL e-Gov', details: buildPANDetails(d, outcome) };
  logVerification(req, 'PAN', d.id, d.name, outcome, refId, timestamp);
  logAudit(req, 'verify.pan', { driverId: d.id, name: d.name, status: outcome, refId });
  res.json({ success: true, driverId: d.id, panVerification: d.panVerification });
});

// Alerts — auto-generated from real expiry dates + manual alerts
app.get('/api/alerts', auth, (req, res) => {
  const today = new Date();
  function daysLeft(dateStr) {
    return Math.ceil((new Date(dateStr) - today) / 86400000);
  }

  const autoAlerts = [];

  // Vehicle compliance alerts (within 30 days or expired)
  complianceRecords.forEach(r => {
    const vehicle = vehicles.find(v => v.id === r.vehicleId);
    const regNum = vehicle ? vehicle.regNumber : r.vehicleId;
    const checks = [
      { name: 'Insurance',            expiry: r.insurance.expiry },
      { name: 'Fitness Certificate',  expiry: r.fitness.expiry },
      { name: 'Pollution Certificate',expiry: r.pollution.expiry },
      { name: 'State Permit',         expiry: r.statePermit.expiry },
      { name: 'National Permit',      expiry: r.nationalPermit.expiry },
    ];
    checks.forEach(c => {
      const days = daysLeft(c.expiry);
      if (days <= 30) {
        autoAlerts.push({
          id: `AUTO-${r.vehicleId}-${c.name.replace(/\s/g, '')}`,
          type: days < 0 ? 'Compliance Expired' : 'Compliance Expiring',
          severity: days < 0 ? 'Critical' : days <= 7 ? 'High' : 'Medium',
          vehicle: regNum,
          message: days < 0
            ? `${c.name} EXPIRED ${Math.abs(days)} days ago for ${regNum}`
            : `${c.name} expiring in ${days} day${days === 1 ? '' : 's'} for ${regNum}`,
          time: 'Auto-generated',
          read: false,
        });
      }
    });
  });

  // Driver license alerts (within 60 days or expired)
  drivers.forEach(d => {
    const days = daysLeft(d.licenseExpiry);
    if (days <= 60) {
      autoAlerts.push({
        id: `AUTO-DL-${d.id}`,
        type: days < 0 ? 'License Expired' : 'License Expiring',
        severity: days < 0 ? 'Critical' : days <= 30 ? 'High' : 'Medium',
        vehicle: 'Driver',
        message: days < 0
          ? `${d.name}'s driving license EXPIRED ${Math.abs(days)} days ago`
          : `${d.name}'s driving license expiring in ${days} day${days === 1 ? '' : 's'}`,
        time: 'Auto-generated',
        read: false,
      });
    }
  });

  res.json([...autoAlerts, ...alerts]);
});

// Costing
app.get('/api/costing', auth, (req, res) => {
  const totalRevenue = costings.reduce((s, c) => s + c.revenue, 0);
  const totalCost = costings.reduce((s, c) => s + c.totalCost, 0);
  const totalProfit = totalRevenue - totalCost;
  res.json({ costings, summary: { totalRevenue, totalCost, totalProfit, avgMargin: Math.round(totalProfit / totalRevenue * 100) } });
});

// Analytics
app.get('/api/analytics', auth, (req, res) => res.json(analytics));

// Users
app.get('/api/users', auth, (req, res) => res.json(users.map(({ password, ...u }) => u)));

// Activity tracking — page visits (fire-and-forget from frontend layout)
app.post('/api/activity/visit', auth, (req, res) => {
  const { page } = req.body;
  if (!page || typeof page !== 'string') return res.sendStatus(204);
  const uid = req.user.id;
  if (!pageVisits[uid]) pageVisits[uid] = {};
  pageVisits[uid][page] = (pageVisits[uid][page] || 0) + 1;
  res.sendStatus(204);
});

// Activity summary — login history + page visits (Super Admin only)
app.get('/api/activity', auth, requireRole(), (req, res) => {
  res.json({ loginHistory: [...loginHistory].reverse(), pageVisits });
});

// Audit log — who changed what, and when (Super Admin only)
app.get('/api/audit-log', auth, requireRole(), async (req, res) => {
  try {
    const log = await prisma.auditLogEntry.findMany({ orderBy: { timestamp: 'desc' }, take: MAX_AUDIT_ENTRIES });
    res.json(log);
  } catch (e) {
    console.error('Audit log read failed:', e.message);
    res.json([]);
  }
});

// Update actual toll for a completed trip
app.patch('/api/costing/:tripId/toll', auth, requireRole('Accountant'), (req, res) => {
  const entry = costings.find(c => c.tripId === req.params.tripId);
  if (!entry) return res.status(404).json({ error: 'Trip costing not found' });
  const { actualToll } = req.body;
  if (typeof actualToll !== 'number') return res.status(400).json({ error: 'actualToll must be a number' });
  const previousToll = entry.toll;
  entry.toll = actualToll;
  entry.totalCost = entry.fuel + entry.toll + entry.driver + entry.maintenance + entry.tyre + entry.misc;
  entry.profit = entry.revenue - entry.totalCost;
  entry.margin = Math.round(entry.profit / entry.revenue * 100);
  logAudit(req, 'costing.toll.update', { tripId: entry.tripId, previousToll, newToll: actualToll });
  res.json({ success: true, costing: entry });
});

// Toll Routes — all predefined highway corridors with plaza charges
app.get('/api/toll/routes', auth, (req, res) => res.json(tollRoutes));

// City autocomplete — search Indian cities by name/alias
app.get('/api/city-suggest', auth, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const query = q.toLowerCase().trim();
  const results = indianCities
    .filter(c => {
      const nameMatch    = c.name.toLowerCase().includes(query);
      const aliasMatch   = c.aliases?.some(a => a.toLowerCase().includes(query));
      const stateMatch   = c.state.toLowerCase().includes(query);
      return nameMatch || aliasMatch || stateMatch;
    })
    // Prefer exact-start matches over contains matches
    .sort((a, b) => {
      const aStart = a.name.toLowerCase().startsWith(query) || a.aliases?.some(al => al.toLowerCase().startsWith(query));
      const bStart = b.name.toLowerCase().startsWith(query) || b.aliases?.some(al => al.toLowerCase().startsWith(query));
      return (bStart ? 1 : 0) - (aStart ? 1 : 0);
    })
    .slice(0, 8)
    .map(c => ({ name: c.name, state: c.state, lat: c.lat, lng: c.lng }));
  res.json(results);
});

// Remote city search — OpenStreetMap Nominatim (covers every Indian town/village/industrial area)
app.get('/api/city-suggest-remote', auth, async (req, res) => {
  const { q } = req.query;
  if (!q || String(q).trim().length < 2) return res.json([]);
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(String(q))}&countrycodes=IN&format=json&limit=8&addressdetails=1&featuretype=city,town,village,suburb,industrial`;
    const data = await fetch(url, {
      headers: { 'User-Agent': 'TransportMS/1.0 (gauravkhohal@gmail.com)' }
    }).then(r => r.json());

    const results = data
      .filter(r => r.lat && r.lon)
      .map(r => {
        const a = r.address || {};
        const name = a.city || a.town || a.village || a.suburb || a.county || a.industrial || r.name || r.display_name.split(',')[0];
        const state = a.state || '';
        const display = r.display_name.split(',').slice(0, 3).join(',').trim();
        return { name: name.trim(), state: state.trim(), display, lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
      })
      .filter(r => r.name && r.lat && r.lng);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Remote search failed: ' + err.message });
  }
});

// Auto-calculate road distance — uses local city coordinates + OSRM routing
app.get('/api/calc-distance', auth, async (req, res) => {
  const { fromLat, fromLng, toLat, toLng, fromName, toName } = req.query;
  if (!fromLat || !fromLng || !toLat || !toLng) {
    return res.status(400).json({ error: 'fromLat, fromLng, toLat, toLng are required' });
  }

  try {
    const route = await fetch(
      `http://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`,
      { headers: { 'User-Agent': 'TransportMS/1.0' } }
    ).then(r => r.json());

    if (route.code !== 'Ok' || !route.routes?.length) {
      return res.status(404).json({ error: 'No road route found between these cities' });
    }

    res.json({
      from:        fromName || 'City A',
      to:          toName   || 'City B',
      distanceKm:  Math.round(route.routes[0].distance / 1000),
      durationMin: Math.round(route.routes[0].duration / 60),
    });
  } catch (err) {
    res.status(500).json({ error: 'Distance calculation failed: ' + err.message });
  }
});

// Toll Reconciliation — all trips with planned vs actual toll
app.get('/api/toll/reconciliation', auth, (req, res) => {
  const totalPlanned = tollReconciliations.reduce((s, r) => s + r.plannedToll, 0);
  const totalActual  = tollReconciliations.reduce((s, r) => s + r.totalActual, 0);
  const totalFastTag = tollReconciliations.reduce((s, r) => s + r.fasttagAmount, 0);
  const totalCash    = tollReconciliations.reduce((s, r) => s + r.cashAmount, 0);
  const totalVariance= tollReconciliations.reduce((s, r) => s + r.variance, 0);
  const pending      = tollReconciliations.filter(r => r.status !== 'Reconciled').length;
  res.json({ reconciliations: tollReconciliations, summary: { totalPlanned, totalActual, totalFastTag, totalCash, totalVariance, pending } });
});

// Single reconciliation detail with plaza breakdown
app.get('/api/toll/reconciliation/:id', auth, (req, res) => {
  const rec = tollReconciliations.find(r => r.id === req.params.id);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  const trip    = trips.find(t => t.id === rec.tripId);
  const vehicle = vehicles.find(v => v.id === rec.vehicleId);
  res.json({ ...rec, tripDetails: trip, vehicleDetails: vehicle });
});

// FASTag — accounts, transactions, sync
let fastagSettings = { bank: '', apiKey: '', clientId: '', configured: false };
let lastSyncedAt = null;

app.get('/api/fasttag/accounts', auth, (req, res) => {
  const lowBalance = fastagAccounts.filter(a => a.status === 'Low Balance').length;
  const inactive   = fastagAccounts.filter(a => a.status === 'Inactive').length;
  const totalBalance = fastagAccounts.reduce((s, a) => s + a.balance, 0);
  res.json({ accounts: fastagAccounts, summary: { totalBalance, lowBalance, inactive, totalAccounts: fastagAccounts.length }, lastSyncedAt, settings: fastagSettings });
});

app.get('/api/fasttag/transactions', auth, (req, res) => {
  const { vehicleId, matched } = req.query;
  let txns = [...fastagTransactions];
  if (vehicleId) txns = txns.filter(t => t.vehicleId === vehicleId);
  if (matched === 'false') txns = txns.filter(t => !t.matched);
  if (matched === 'true')  txns = txns.filter(t => t.matched);
  res.json({ transactions: txns, total: txns.length });
});

app.post('/api/fasttag/sync', auth, requireRole('Accountant', 'Fleet Manager'), async (req, res) => {
  // Simulate bank API call — in real integration replace this with actual bank API fetch
  const newTxn = {
    txnId: 'FTX' + (fastagTransactions.length + 1).toString().padStart(3, '0'),
    vehicleId: 'V003', regNumber: 'GJ-01-EF-9012', bank: 'SBI',
    plaza: 'Pune (Khalapur) Toll', highway: 'NH-48', amount: 340,
    timestamp: new Date().toISOString(), tripId: 'T003', matched: true,
  };
  try { await prisma.fastagTransaction.create({ data: newTxn }); }
  catch (e) {
    console.error('Failed to persist fastag transaction:', e.message);
    return res.status(500).json({ error: 'Sync failed. Please try again.' });
  }
  lastSyncedAt = new Date().toISOString();
  fastagTransactions.unshift(newTxn);
  res.json({ success: true, lastSyncedAt, newTransactions: 1, message: 'Synced 1 new transaction from SBI FASTag API' });
});

app.patch('/api/fasttag/settings', auth, requireRole('Accountant', 'Fleet Manager'), (req, res) => {
  const { bank, apiKey, clientId } = req.body;
  fastagSettings = { bank: bank || '', apiKey: apiKey || '', clientId: clientId || '', configured: !!(bank && apiKey) };
  res.json({ success: true, settings: fastagSettings });
});

// Add new FASTag account for a vehicle
app.post('/api/fasttag/accounts', auth, requireRole('Accountant', 'Fleet Manager'), async (req, res) => {
  const { vehicleId, fastagId, bank } = req.body;
  if (!vehicleId || !fastagId || !bank) return res.status(400).json({ error: 'vehicleId, fastagId, bank required' });
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const existing = fastagAccounts.findIndex(a => a.vehicleId === vehicleId);
  const account = existing >= 0
    ? { ...fastagAccounts[existing], fastagId, bank }
    : { vehicleId, regNumber: vehicle.regNumber, fastagId, bank, balance: 0, status: 'Active', lastTransaction: new Date().toISOString() };
  try {
    await prisma.fastagAccount.upsert({ where: { vehicleId }, create: account, update: { fastagId, bank } });
  } catch (e) {
    console.error('Failed to persist fastag account:', e.message);
    return res.status(500).json({ error: 'Failed to save FASTag account. Please try again.' });
  }
  if (existing >= 0) fastagAccounts[existing] = account; else fastagAccounts.push(account);
  res.json({ success: true, account });
});

// Edit FASTag account (update ID, bank, topup balance)
app.patch('/api/fasttag/accounts/:vehicleId', auth, requireRole('Accountant', 'Fleet Manager'), async (req, res) => {
  const acct = fastagAccounts.find(a => a.vehicleId === req.params.vehicleId);
  if (!acct) return res.status(404).json({ error: 'FASTag account not found' });
  const { fastagId, bank, balance } = req.body;
  const updates = {};
  if (fastagId !== undefined) updates.fastagId = fastagId;
  if (bank !== undefined) updates.bank = bank;
  if (balance !== undefined) { updates.balance = Number(balance); updates.status = balance < 500 ? 'Low Balance' : 'Active'; }
  try { await prisma.fastagAccount.update({ where: { vehicleId: acct.vehicleId }, data: updates }); }
  catch (e) {
    console.error('Failed to persist fastag account update:', e.message);
    return res.status(500).json({ error: 'Failed to save changes. Please try again.' });
  }
  Object.assign(acct, updates);
  res.json({ success: true, account: acct });
});

app.patch('/api/fasttag/link/:txnId', auth, requireRole('Accountant', 'Fleet Manager'), async (req, res) => {
  const { tripId } = req.body;
  const txn = fastagTransactions.find(t => t.txnId === req.params.txnId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });
  const prevTripId = txn.tripId;
  try { await prisma.fastagTransaction.update({ where: { txnId: txn.txnId }, data: { tripId, matched: true } }); }
  catch (e) {
    console.error('Failed to persist fastag link:', e.message);
    return res.status(500).json({ error: 'Failed to link transaction. Please try again.' });
  }
  txn.tripId = tripId;
  txn.matched = true;
  logAudit(req, 'fasttag.transaction.link', { txnId: req.params.txnId, vehicleId: txn.vehicleId, amount: txn.amount, plaza: txn.plaza, previousTripId: prevTripId, newTripId: tripId });
  res.json({ success: true, transaction: txn });
});

// Petty Cash
app.get('/api/petty-cash', auth, (req, res) => {
  const totalIssued = pettyCash.reduce((s, p) => s + p.cashIssued, 0);
  const totalSpent  = pettyCash.reduce((s, p) => s + p.totalSpent, 0);
  const pending     = pettyCash.filter(p => p.status === 'Pending').length;
  const netBalance  = pettyCash.reduce((s, p) => s + p.balance, 0);
  const pendingTransfers = pettyCash.filter(p => p.transferStatus === 'Pending Approval').length;
  const failedTransfers  = pettyCash.filter(p => p.transferStatus === 'Failed').length;
  res.json({ entries: pettyCash, summary: { totalIssued, totalSpent, pending, netBalance, pendingTransfers, failedTransfers } });
});

// Company payout pool (Razorpay/Cashfree payout account balance)
app.get('/api/payouts/pool', auth, (req, res) => {
  res.json({ ...payoutPool, lowBalance: payoutPool.balance < payoutPool.lowBalanceThreshold });
});

app.post('/api/payouts/pool/load', auth, requireRole('Accountant'), async (req, res) => {
  const { amount } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Valid amount required' });
  const amt = Number(amount);
  const newTotalLoaded = payoutPool.totalLoaded + amt;
  const newBalance = payoutPool.balance + amt;
  try { await prisma.payoutPool.update({ where: { id: 'singleton' }, data: { totalLoaded: newTotalLoaded, balance: newBalance } }); }
  catch (e) {
    console.error('Failed to persist payout pool load:', e.message);
    return res.status(500).json({ error: 'Failed to load funds. Please try again.' });
  }
  payoutPool.totalLoaded = newTotalLoaded;
  payoutPool.balance = newBalance;
  logAudit(req, 'payout.pool.load', { amount: amt, newBalance: payoutPool.balance });
  res.json({ success: true, pool: { ...payoutPool, lowBalance: payoutPool.balance < payoutPool.lowBalanceThreshold } });
});

app.patch('/api/petty-cash/:id/reconcile', auth, requireRole('Accountant'), async (req, res) => {
  const entry = pettyCash.find(p => p.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const { diesel = 0, toll = 0, food = 0, maintenance = 0, misc = 0, notes = '' } = req.body;
  const totalSpent = diesel + toll + food + maintenance + misc;
  const balance = entry.cashIssued - totalSpent;
  const status = balance >= 0 ? 'Settled' : 'Short Paid';
  const settledDate = new Date().toISOString().split('T')[0];
  try {
    await prisma.pettyCash.update({ where: { id: entry.id }, data: {
      expenses: { diesel, toll, food, maintenance, misc }, totalSpent, balance, status, settledDate, notes,
    }});
  } catch (e) {
    console.error('Failed to persist petty cash reconciliation:', e.message);
    return res.status(500).json({ error: 'Failed to save reconciliation. Please try again.' });
  }
  entry.expenses = { diesel, toll, food, maintenance, misc };
  entry.totalSpent = totalSpent;
  entry.balance = balance;
  entry.status = status;
  entry.settledDate = settledDate;
  entry.notes = notes;
  logAudit(req, 'pettycash.reconcile', { entryId: entry.id, totalSpent: entry.totalSpent, status: entry.status });
  res.json({ success: true, entry });
});

app.post('/api/petty-cash', auth, requireRole('Accountant'), async (req, res) => {
  const { tripId, driverId, cashIssued, issueDate, notes } = req.body;
  const driver = drivers.find(d => d.id === driverId);
  const trip = trips.find(t => t.id === tripId);
  const newEntry = {
    id: 'PC' + (pettyCash.length + 1).toString().padStart(3, '0'),
    tripId, driverId,
    driverName: driver?.name || driverId,
    tripRoute: trip ? `${trip.origin} → ${trip.destination}` : '—',
    issueDate, cashIssued: Number(cashIssued),
    expenses: { diesel: 0, toll: 0, food: 0, maintenance: 0, misc: 0 },
    totalSpent: 0, balance: Number(cashIssued),
    status: 'Pending', settledDate: null, notes: notes || '',
    transferStatus: 'Pending Approval',
    transferAmount: Number(cashIssued),
    transferMode: driver?.bankDetails?.upiId ? 'UPI' : 'Bank Transfer',
    payoutId: null, payoutTime: null, failureReason: null,
  };
  try { await prisma.pettyCash.create({ data: newEntry }); }
  catch (e) {
    console.error('Failed to persist petty cash entry:', e.message);
    return res.status(500).json({ error: 'Failed to issue petty cash. Please try again.' });
  }
  pettyCash.unshift(newEntry);
  logAudit(req, 'pettycash.issue', { entryId: newEntry.id, tripId, driverId, driverName: newEntry.driverName, cashIssued: newEntry.cashIssued });
  res.json({ success: true, entry: newEntry });
});

// Approve & transfer (or retry a failed transfer) — simulates a Razorpay/Cashfree Payouts API call
app.patch('/api/petty-cash/:id/transfer', auth, requireRole('Fleet Manager'), async (req, res) => {
  const entry = pettyCash.find(p => p.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  if (entry.transferStatus !== 'Pending Approval' && entry.transferStatus !== 'Failed') {
    return res.status(400).json({ error: 'No pending or failed transfer to process for this entry' });
  }

  const driver = drivers.find(d => d.id === entry.driverId);
  const hasPayee = driver?.bankDetails?.upiId || driver?.bankDetails?.accountNumber;
  if (!hasPayee) {
    return res.status(400).json({ error: `${entry.driverName} has no bank/UPI details on file. Add them in the Drivers page first.` });
  }

  // Simulate calling the payout API
  if (entry.transferAmount > payoutPool.balance) {
    try { await prisma.pettyCash.update({ where: { id: entry.id }, data: { transferStatus: 'Failed', failureReason: 'Insufficient pool balance' } }); }
    catch (e) {
      console.error('Failed to persist transfer failure:', e.message);
      return res.status(500).json({ error: 'Failed to process transfer. Please try again.' });
    }
    entry.transferStatus = 'Failed';
    entry.failureReason = 'Insufficient pool balance';
    logAudit(req, 'pettycash.transfer.failed', { entryId: entry.id, driverId: entry.driverId, amount: entry.transferAmount, reason: entry.failureReason });
    return res.json({ success: true, entry, pool: { ...payoutPool, lowBalance: payoutPool.balance < payoutPool.lowBalanceThreshold } });
  }

  const newPoolBalance = payoutPool.balance - entry.transferAmount;
  const payoutId = 'pout_' + crypto.randomBytes(5).toString('hex');
  const payoutTime = new Date().toISOString();
  try {
    await prisma.$transaction([
      prisma.payoutPool.update({ where: { id: 'singleton' }, data: { balance: newPoolBalance } }),
      prisma.pettyCash.update({ where: { id: entry.id }, data: { transferStatus: 'Success', failureReason: null, payoutId, payoutTime } }),
    ]);
  } catch (e) {
    console.error('Failed to persist transfer success:', e.message);
    return res.status(500).json({ error: 'Failed to process transfer. Please try again.' });
  }
  payoutPool.balance = newPoolBalance;
  entry.transferStatus = 'Success';
  entry.failureReason = null;
  entry.payoutId = payoutId;
  entry.payoutTime = payoutTime;
  logAudit(req, 'pettycash.transfer.success', { entryId: entry.id, driverId: entry.driverId, driverName: entry.driverName, amount: entry.transferAmount, payoutId: entry.payoutId });
  res.json({ success: true, entry, pool: { ...payoutPool, lowBalance: payoutPool.balance < payoutPool.lowBalanceThreshold } });
});

// Tyres
app.get('/api/tyres', auth, (req, res) => {
  const inUse      = tyres.filter(t => t.status === 'In Use').length;
  const spare      = tyres.filter(t => t.status === 'Spare').length;
  const underWarranty = tyres.filter(t => {
    if (!t.warrantyExpiry && !t.warrantyKm) return false;
    if (t.warrantyExpiry && new Date(t.warrantyExpiry) > new Date()) return true;
    if (t.warrantyKm && t.currentKmRun < t.warrantyKm) return true;
    return false;
  }).length;
  const critical   = tyres.filter(t => t.status === 'In Use' && t.expectedLifeKm > 0 && (t.currentKmRun / t.expectedLifeKm) >= 0.85).length;
  const condemned  = tyres.filter(t => t.status === 'Condemned').length;
  const totalValue = tyres.reduce((s, t) => s + t.purchasePrice, 0);
  res.json({ tyres, summary: { total: tyres.length, inUse, spare, underWarranty, critical, condemned, totalValue } });
});

// Picks exactly the columns the Tyre table has — mirrors tripDbFields().
function tyreDbFields(t) {
  return {
    vehicleId: t.vehicleId, regNumber: t.regNumber, serialNo: t.serialNo ?? '', brand: t.brand,
    model: t.model ?? '', size: t.size ?? '', type: t.type ?? '', position: t.position ?? '',
    purchaseDate: t.purchaseDate ?? '', purchasePrice: Number(t.purchasePrice) || 0,
    vendor: t.vendor || '', invoiceNo: t.invoiceNo ?? '', warrantyType: t.warrantyType ?? '',
    warrantyKm: Number(t.warrantyKm) || 0, warrantyExpiry: t.warrantyExpiry || null,
    kmAtFitment: Number(t.kmAtFitment) || 0, expectedLifeKm: Number(t.expectedLifeKm) || 0,
    currentKmRun: Number(t.currentKmRun) || 0, treadDepth: Number(t.treadDepth) || 0,
    lastPressureCheck: t.lastPressureCheck ?? '', lastRotationDate: t.lastRotationDate || null,
    retreads: Number(t.retreads) || 0, status: t.status || 'In Use', notes: t.notes ?? '',
  };
}

app.post('/api/tyres', auth, requireRole('Fleet Manager'), async (req, res) => {
  const data = req.body;
  const vehicle = vehicles.find(v => v.id === data.vehicleId);
  const newTyre = {
    ...data,
    id: 'TY' + (tyres.length + 1).toString().padStart(3, '0'),
    regNumber: vehicle?.regNumber || '',
    currentKmRun: data.currentKmRun || 0,
    retreads: data.retreads || 0,
  };
  try { await prisma.tyre.create({ data: { id: newTyre.id, ...tyreDbFields(newTyre) } }); }
  catch (e) {
    console.error('Failed to persist tyre:', e.message);
    return res.status(500).json({ error: 'Failed to save tyre. Please try again.' });
  }
  tyres.unshift(newTyre);
  logAudit(req, 'tyre.add', { tyreId: newTyre.id, vehicleId: newTyre.vehicleId, brand: newTyre.brand, purchasePrice: newTyre.purchasePrice, vendor: newTyre.vendor });
  res.json({ success: true, tyre: newTyre });
});

app.patch('/api/tyres/:id', auth, requireRole('Fleet Manager'), async (req, res) => {
  const tyre = tyres.find(t => t.id === req.params.id);
  if (!tyre) return res.status(404).json({ error: 'Tyre not found' });
  const updated = { ...tyre, ...req.body };
  if (req.body.vehicleId) {
    const vehicle = vehicles.find(v => v.id === req.body.vehicleId);
    if (vehicle) updated.regNumber = vehicle.regNumber;
  }
  try { await prisma.tyre.update({ where: { id: tyre.id }, data: tyreDbFields(updated) }); }
  catch (e) {
    console.error('Failed to persist tyre update:', e.message);
    return res.status(500).json({ error: 'Failed to save changes. Please try again.' });
  }
  Object.assign(tyre, updated);
  logAudit(req, 'tyre.update', { tyreId: tyre.id, vehicleId: tyre.vehicleId, fields: Object.keys(req.body) });
  res.json({ success: true, tyre });
});

// ── Spare Parts Management ──────────────────────────────────────────────────
function buildSpareLedgerEntry(req, data) {
  return { id: 'SL' + String(spareLedger.length + 1).padStart(4, '0'), ...data, performedBy: req.user.name };
}

app.get('/api/spares', auth, (req, res) => {
  const lowStock    = spareParts.filter(p => p.currentStock > 0 && p.currentStock <= p.reorderLevel).length;
  const outOfStock  = spareParts.filter(p => p.currentStock === 0).length;
  const totalValue  = spareParts.reduce((s, p) => s + p.currentStock * p.unitPrice, 0);
  res.json({ spareParts, summary: { total: spareParts.length, lowStock, outOfStock, totalValue } });
});

app.get('/api/spares/ledger', auth, (req, res) => res.json(spareLedger));

app.post('/api/spares', auth, requireRole('Fleet Manager'), async (req, res) => {
  const data = req.body;
  const newPart = {
    id: 'SP' + String(spareParts.length + 1).padStart(3, '0'),
    partNo: data.partNo, name: data.name, category: data.category, unit: data.unit,
    currentStock: Number(data.currentStock) || 0, reorderLevel: Number(data.reorderLevel) || 0,
    unitPrice: Number(data.unitPrice) || 0, vendor: data.vendor || '', location: data.location || '',
  };
  const entry = newPart.currentStock > 0 ? buildSpareLedgerEntry(req, {
    partId: newPart.id, partName: newPart.name, type: 'IN', quantity: newPart.currentStock,
    date: new Date().toISOString().split('T')[0], vehicleId: null, regNumber: null,
    reference: 'Opening Stock', vendor: newPart.vendor, unitPrice: newPart.unitPrice,
    notes: 'Initial stock entry', balanceAfter: newPart.currentStock,
  }) : null;
  try {
    await prisma.$transaction([
      prisma.sparePart.create({ data: newPart }),
      ...(entry ? [prisma.spareLedgerEntry.create({ data: entry })] : []),
    ]);
  } catch (e) {
    console.error('Failed to persist spare part:', e.message);
    return res.status(500).json({ error: 'Failed to save spare part. Please try again.' });
  }
  spareParts.unshift(newPart);
  if (entry) spareLedger.unshift(entry);
  logAudit(req, 'spares.add', { partId: newPart.id, name: newPart.name, currentStock: newPart.currentStock });
  res.json({ success: true, part: newPart });
});

app.patch('/api/spares/:id', auth, requireRole('Fleet Manager'), async (req, res) => {
  const part = spareParts.find(p => p.id === req.params.id);
  if (!part) return res.status(404).json({ error: 'Spare part not found' });
  const allowed = ['partNo', 'name', 'category', 'unit', 'reorderLevel', 'unitPrice', 'vendor', 'location'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  try { await prisma.sparePart.update({ where: { id: part.id }, data: updates }); }
  catch (e) {
    console.error('Failed to persist spare part update:', e.message);
    return res.status(500).json({ error: 'Failed to save changes. Please try again.' });
  }
  Object.assign(part, updates);
  logAudit(req, 'spares.update', { partId: part.id, fields: Object.keys(req.body) });
  res.json({ success: true, part });
});

app.post('/api/spares/:id/stock-in', auth, requireRole('Fleet Manager'), async (req, res) => {
  const part = spareParts.find(p => p.id === req.params.id);
  if (!part) return res.status(404).json({ error: 'Spare part not found' });
  const quantity = Number(req.body.quantity);
  if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });
  const { vendor, reference, unitPrice, notes } = req.body;
  const newStock = part.currentStock + quantity;
  const newUnitPrice = unitPrice ? Number(unitPrice) : part.unitPrice;
  const newVendor = vendor || part.vendor;
  const entry = buildSpareLedgerEntry(req, {
    partId: part.id, partName: part.name, type: 'IN', quantity,
    date: new Date().toISOString().split('T')[0], vehicleId: null, regNumber: null,
    reference: reference || 'Restock', vendor: newVendor, unitPrice: newUnitPrice,
    notes: notes || '', balanceAfter: newStock,
  });
  try {
    await prisma.$transaction([
      prisma.sparePart.update({ where: { id: part.id }, data: { currentStock: newStock, unitPrice: newUnitPrice, vendor: newVendor } }),
      prisma.spareLedgerEntry.create({ data: entry }),
    ]);
  } catch (e) {
    console.error('Failed to persist stock-in:', e.message);
    return res.status(500).json({ error: 'Failed to record stock-in. Please try again.' });
  }
  part.currentStock = newStock;
  part.unitPrice = newUnitPrice;
  part.vendor = newVendor;
  spareLedger.unshift(entry);
  logAudit(req, 'spares.stock_in', { partId: part.id, name: part.name, quantity, balanceAfter: part.currentStock });
  res.json({ success: true, part, entry });
});

app.post('/api/spares/:id/issue', auth, requireRole('Fleet Manager'), async (req, res) => {
  const part = spareParts.find(p => p.id === req.params.id);
  if (!part) return res.status(404).json({ error: 'Spare part not found' });
  const quantity = Number(req.body.quantity);
  if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });
  if (quantity > part.currentStock) return res.status(400).json({ error: `Insufficient stock: only ${part.currentStock} ${part.unit} available` });
  const vehicle = vehicles.find(v => v.id === req.body.vehicleId);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const { reference, notes } = req.body;
  const newStock = part.currentStock - quantity;
  const entry = buildSpareLedgerEntry(req, {
    partId: part.id, partName: part.name, type: 'OUT', quantity,
    date: new Date().toISOString().split('T')[0], vehicleId: vehicle.id, regNumber: vehicle.regNumber,
    reference: reference || '', vendor: null, unitPrice: part.unitPrice,
    notes: notes || '', balanceAfter: newStock,
  });
  try {
    await prisma.$transaction([
      prisma.sparePart.update({ where: { id: part.id }, data: { currentStock: newStock } }),
      prisma.spareLedgerEntry.create({ data: entry }),
    ]);
  } catch (e) {
    console.error('Failed to persist issue:', e.message);
    return res.status(500).json({ error: 'Failed to record issue. Please try again.' });
  }
  part.currentStock = newStock;
  spareLedger.unshift(entry);
  logAudit(req, 'spares.issue', { partId: part.id, name: part.name, quantity, vehicleId: vehicle.id, regNumber: vehicle.regNumber, balanceAfter: part.currentStock });
  res.json({ success: true, part, entry });
});

// ── CHAT (Socket.io) ────────────────────────────────────────────────────────

const CHAT_FILE = path.join(__dirname, 'data', 'chatMessages.json');
const MAX_PER_CHANNEL = 300;

// Load persisted messages
function loadMessages() {
  try { if (fs.existsSync(CHAT_FILE)) return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')); }
  catch(e) {}
  return {};
}
function saveMessages() {
  try { fs.writeFileSync(CHAT_FILE, JSON.stringify(chatMessages, null, 2)); }
  catch(e) {}
}

let chatMessages = loadMessages();

const CHANNELS = [
  { id: 'general',     name: 'General',       icon: '💬', description: 'Company-wide announcements' },
  { id: 'fleet',       name: 'Vehicle Management', icon: '🚛', description: 'Vehicle and GPS updates' },
  { id: 'accounts',    name: 'Accounts',       icon: '💰', description: 'Finance and billing' },
  { id: 'drivers',     name: 'Drivers',        icon: '👤', description: 'Driver management' },
  { id: 'maintenance', name: 'Maintenance',    icon: '🔧', description: 'Workshop and repairs' },
  { id: 'compliance',  name: 'Compliance',     icon: '📋', description: 'Documents and compliance' },
];

// Seed a few messages so chat doesn't look empty on first open
function seedIfEmpty(channelId, msgs) {
  if (!chatMessages[channelId] || chatMessages[channelId].length === 0) {
    chatMessages[channelId] = msgs;
    saveMessages();
  }
}
seedIfEmpty('general', [
  { id: 'seed-g1', channelId: 'general', userId: 'U001', userName: 'Admin User', role: 'Super Admin', text: 'Welcome to TransportMS Chat! Use channels to communicate with your team.', timestamp: new Date(Date.now() - 86400000).toISOString() },
  { id: 'seed-g2', channelId: 'general', userId: 'U002', userName: 'Priya Mehta', role: 'Fleet Manager', text: 'Thanks! This will make coordination much easier.', timestamp: new Date(Date.now() - 82800000).toISOString() },
]);
seedIfEmpty('fleet', [
  { id: 'seed-f1', channelId: 'fleet', userId: 'U002', userName: 'Priya Mehta', role: 'Fleet Manager', text: 'V004 (DL-01-GH-3456) is under maintenance. ETA for completion is tomorrow.', timestamp: new Date(Date.now() - 7200000).toISOString() },
  { id: 'seed-f2', channelId: 'fleet', userId: 'U001', userName: 'Admin User', role: 'Super Admin', text: 'Noted. Ensure fitness certificate is renewed before putting back on road.', timestamp: new Date(Date.now() - 7000000).toISOString() },
]);
seedIfEmpty('accounts', [
  { id: 'seed-a1', channelId: 'accounts', userId: 'U004', userName: 'Nisha Patel', role: 'Accountant', text: 'Petty cash reconciliation for May is pending from 3 drivers. Please follow up.', timestamp: new Date(Date.now() - 3600000).toISOString() },
]);

const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true }
});

const onlineUsers = new Map(); // socketId → { userId, userName, role }

io.on('connection', (socket) => {
  // User identifies themselves
  socket.on('identify', ({ userId, userName, role }) => {
    onlineUsers.set(socket.id, { userId, userName, role });
    io.emit('users_online', Array.from(onlineUsers.values()));
  });

  // Get channel list + trip channels
  socket.on('get_channels', () => {
    const tripChannels = trips.slice(0, 10).map(t => ({
      id: `trip-${t.id}`,
      name: `${t.id}: ${t.origin}→${t.destination}`,
      icon: '🗺️',
      description: `${t.customer} · ${t.status}`,
      tripId: t.id,
    }));
    socket.emit('channels', { channels: CHANNELS, tripChannels });
  });

  // Get message history for a channel
  socket.on('get_history', ({ channelId }) => {
    socket.join(channelId);
    socket.emit('history', { channelId, messages: chatMessages[channelId] || [] });
  });

  // Send message to a channel
  socket.on('send_message', ({ channelId, userId, userName, role, text }) => {
    if (!text || !text.trim()) return;
    const msg = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      channelId, userId, userName, role,
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };
    if (!chatMessages[channelId]) chatMessages[channelId] = [];
    chatMessages[channelId].push(msg);
    if (chatMessages[channelId].length > MAX_PER_CHANNEL) {
      chatMessages[channelId] = chatMessages[channelId].slice(-MAX_PER_CHANNEL);
    }
    saveMessages();
    io.to(channelId).emit('new_message', msg);
  });

  // Direct message
  socket.on('send_dm', ({ fromId, fromName, fromRole, toId, text }) => {
    if (!text || !text.trim()) return;
    const dmKey = [fromId, toId].sort().join('-');
    const msg = {
      id: `dm-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      channelId: dmKey, userId: fromId, userName: fromName, role: fromRole,
      text: text.trim(), timestamp: new Date().toISOString(), isDM: true,
    };
    if (!chatMessages[dmKey]) chatMessages[dmKey] = [];
    chatMessages[dmKey].push(msg);
    if (chatMessages[dmKey].length > MAX_PER_CHANNEL) {
      chatMessages[dmKey] = chatMessages[dmKey].slice(-MAX_PER_CHANNEL);
    }
    saveMessages();
    // Emit to both sender and receiver sockets
    const allSockets = Array.from(io.sockets.sockets.values());
    allSockets.forEach(s => {
      const u = onlineUsers.get(s.id);
      if (u && (u.userId === fromId || u.userId === toId)) s.emit('new_message', msg);
    });
  });

  // Get DM history
  socket.on('get_dm_history', ({ fromId, toId }) => {
    const dmKey = [fromId, toId].sort().join('-');
    socket.emit('history', { channelId: dmKey, messages: chatMessages[dmKey] || [] });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('users_online', Array.from(onlineUsers.values()));
  });
});

loadFromDatabase()
  .catch(e => console.error('Failed to load data from database, falling back to mock data:', e.message))
  .finally(() => {
    server.listen(PORT, () => console.log(`TMS Backend running on http://localhost:${PORT}`));
  });
