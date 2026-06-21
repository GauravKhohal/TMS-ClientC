// All arrays are empty — data is loaded from Postgres at boot via loadFromDatabase() in server.js.
// Vehicles, drivers, trips, and users are DB-authoritative; add records through the UI.
// An admin user is auto-seeded to the DB on first boot if the users table is empty.

const vehicles = [];
const drivers  = [];
const trips    = [];

// DB-backed modules — always loaded from Postgres, never seeded here
const fuelEntries        = [];
const maintenanceRecords = [];
const complianceRecords  = [];
const consignments       = [];

// Users — DB-backed; admin is auto-seeded by server.js on first boot
const users = [];

// Operational data — in-memory, cleared for production
const alerts              = [];
const costings            = [];
const tollReconciliations = [];
const pettyCash           = [];
const fastagAccounts      = [];
const fastagTransactions  = [];
const tyres               = [];
const verificationLog     = [];
const spareParts          = [];
const spareLedger         = [];

const payoutPool = { totalLoaded: 0, balance: 0, lowBalanceThreshold: 50000 };

// Analytics — returns empty/zero until real data accumulates
const analytics = {
  monthlyRevenue:     [],
  fuelTrend:          [],
  vehicleUtilization: [],
  fleetStatus:        { running: 0, idle: 0, maintenance: 0, breakdown: 0 },
  topDrivers:         [],
};

// Toll routes — NH corridor reference data for the toll calculator (not client-specific)
const tollRoutes = [
  {
    id: 'RT001', origin: 'Delhi', destination: 'Mumbai', highway: 'NH-48', distance: 1421,
    plazas: [
      { id: 'TP001', name: 'Kherki Daula',    location: 'Gurgaon, Haryana',          km: 28,   charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP002', name: 'Bilaspur-Tauru',  location: 'Nuh, Haryana',              km: 80,   charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP003', name: 'Shahjahanpur',    location: 'Alwar, Rajasthan',          km: 190,  charges: { car: 80,  lcv: 130, hcv2: 230, hcv3: 330, multiAxle: 460, oversized: 585 } },
      { id: 'TP004', name: 'Kishangarh',      location: 'Ajmer, Rajasthan',          km: 300,  charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP005', name: 'Kelwa',           location: 'Rajsamand, Rajasthan',      km: 440,  charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP006', name: 'Bavla',           location: 'Ahmedabad, Gujarat',        km: 875,  charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP007', name: 'Vadodara',        location: 'Vadodara, Gujarat',         km: 955,  charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP008', name: 'Kim (Surat)',     location: 'Surat, Gujarat',            km: 1090, charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP009', name: 'Vapi-Silvassa',   location: 'Vapi, Gujarat',             km: 1165, charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP010', name: 'Manor',           location: 'Palghar, Maharashtra',      km: 1255, charges: { car: 80,  lcv: 130, hcv2: 230, hcv3: 330, multiAxle: 460, oversized: 585 } },
    ],
  },
  {
    id: 'RT002', origin: 'Delhi', destination: 'Kolkata', highway: 'NH-19', distance: 1530,
    plazas: [
      { id: 'TP011', name: 'Palwal',               location: 'Palwal, Haryana',             km: 70,   charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP012', name: 'Agra (Khandauli)',     location: 'Agra, Uttar Pradesh',         km: 215,  charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP013', name: 'Tundla',               location: 'Firozabad, UP',               km: 275,  charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP014', name: 'Kanpur (Bithoor)',     location: 'Kanpur, UP',                  km: 475,  charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP015', name: 'Prayagraj (Phaphamau)',location: 'Prayagraj, UP',               km: 640,  charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP016', name: 'Varanasi Bypass',      location: 'Varanasi, UP',                km: 790,  charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP017', name: 'Mohania',              location: 'Kaimur, Bihar',               km: 900,  charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP018', name: 'Aurangabad (Bihar)',   location: 'Aurangabad, Bihar',           km: 1050, charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP019', name: 'Barhi',                location: 'Hazaribagh, Jharkhand',       km: 1220, charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP020', name: 'Panagarh',             location: 'Paschim Bardhaman, WB',       km: 1420, charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
    ],
  },
  {
    id: 'RT003', origin: 'Bangalore', destination: 'Mumbai', highway: 'NH-48', distance: 984,
    plazas: [
      { id: 'TP021', name: 'Nelamangala',     location: 'Bangalore Rural, Karnataka', km: 30,  charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP022', name: 'Tumkur',          location: 'Tumakuru, Karnataka',        km: 70,  charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP023', name: 'Chitradurga',     location: 'Chitradurga, Karnataka',     km: 200, charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP024', name: 'Hubli Bypass',    location: 'Dharwad, Karnataka',         km: 340, charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP025', name: 'Belgaum',         location: 'Belagavi, Karnataka',        km: 430, charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP026', name: 'Kolhapur',        location: 'Kolhapur, Maharashtra',      km: 530, charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP027', name: 'Pune (Khalapur)', location: 'Raigad, Maharashtra',        km: 750, charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP028', name: 'Manor',           location: 'Palghar, Maharashtra',       km: 880, charges: { car: 80,  lcv: 130, hcv2: 230, hcv3: 330, multiAxle: 460, oversized: 585 } },
    ],
  },
  {
    id: 'RT004', origin: 'Ahmedabad', destination: 'Chennai', highway: 'NH-48 / NH-44', distance: 1720,
    plazas: [
      { id: 'TP029', name: 'Sanand',               location: 'Ahmedabad, Gujarat',        km: 25,   charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP030', name: 'Vadodara',             location: 'Vadodara, Gujarat',         km: 105,  charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP031', name: 'Kim (Surat)',          location: 'Surat, Gujarat',            km: 270,  charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP032', name: 'Pune (Khalapur)',      location: 'Raigad, Maharashtra',       km: 560,  charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP033', name: 'Solapur Bypass',       location: 'Solapur, Maharashtra',      km: 850,  charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP034', name: 'Gulbarga',             location: 'Kalaburagi, Karnataka',     km: 1050, charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP035', name: 'Hyderabad (Attapur)',  location: 'Hyderabad, Telangana',      km: 1270, charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP036', name: 'Kurnool',              location: 'Kurnool, Andhra Pradesh',   km: 1440, charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP037', name: 'Nellore',              location: 'Nellore, Andhra Pradesh',   km: 1580, charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP038', name: 'Sriperumbudur',        location: 'Kancheepuram, Tamil Nadu',  km: 1680, charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
    ],
  },
  {
    id: 'RT005', origin: 'Jaipur', destination: 'Hyderabad', highway: 'NH-48 / NH-44', distance: 1120,
    plazas: [
      { id: 'TP039', name: 'Kishangarh',       location: 'Ajmer, Rajasthan',       km: 90,   charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP040', name: 'Udaipur (Debari)', location: 'Udaipur, Rajasthan',     km: 340,  charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP041', name: 'Vadodara',         location: 'Vadodara, Gujarat',      km: 570,  charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP042', name: 'Surat Bypass',     location: 'Surat, Gujarat',         km: 730,  charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP043', name: 'Pune (Khalapur)',  location: 'Raigad, Maharashtra',    km: 850,  charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP044', name: 'Solapur',          location: 'Solapur, Maharashtra',   km: 1000, charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP045', name: 'Gulbarga (Bidar)', location: 'Bidar, Karnataka',       km: 1070, charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
    ],
  },
  {
    id: 'RT006', origin: 'Pune', destination: 'Bangalore', highway: 'NH-48', distance: 840,
    plazas: [
      { id: 'TP046', name: 'Khalapur',        location: 'Raigad, Maharashtra',   km: 65,  charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP047', name: 'Kolhapur',        location: 'Kolhapur, Maharashtra', km: 230, charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP048', name: 'Belgaum',         location: 'Belagavi, Karnataka',   km: 340, charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP049', name: 'Hubli Bypass',    location: 'Dharwad, Karnataka',    km: 430, charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP050', name: 'Davangere',       location: 'Davangere, Karnataka',  km: 570, charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP051', name: 'Tumkur Bypass',   location: 'Tumakuru, Karnataka',   km: 770, charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
    ],
  },
  {
    id: 'RT007', origin: 'Mumbai', destination: 'Jaipur', highway: 'NH-48', distance: 1154,
    plazas: [
      { id: 'TP052', name: 'Vasai Creek',     location: 'Palghar, Maharashtra',   km: 50,  charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP053', name: 'Manor',           location: 'Palghar, Maharashtra',   km: 100, charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP054', name: 'Vapi-Silvassa',   location: 'Vapi, Gujarat',          km: 200, charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
      { id: 'TP055', name: 'Kim (Surat)',     location: 'Surat, Gujarat',         km: 295, charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP056', name: 'Vadodara',        location: 'Vadodara, Gujarat',      km: 425, charges: { car: 80,  lcv: 130, hcv2: 235, hcv3: 340, multiAxle: 470, oversized: 600 } },
      { id: 'TP057', name: 'Bavla',           location: 'Ahmedabad, Gujarat',     km: 530, charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP058', name: 'Kelwa',           location: 'Rajsamand, Rajasthan',   km: 740, charges: { car: 75,  lcv: 125, hcv2: 220, hcv3: 315, multiAxle: 440, oversized: 560 } },
      { id: 'TP059', name: 'Kishangarh',      location: 'Ajmer, Rajasthan',       km: 900, charges: { car: 70,  lcv: 115, hcv2: 205, hcv3: 295, multiAxle: 410, oversized: 520 } },
    ],
  },
];

module.exports = {
  vehicles, drivers, trips,
  fuelEntries, maintenanceRecords, complianceRecords, consignments,
  alerts, users, costings, analytics,
  tollRoutes, tollReconciliations,
  pettyCash, fastagAccounts, fastagTransactions,
  tyres, verificationLog, spareParts, spareLedger,
  payoutPool,
};
