require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { vehicles, drivers, trips, users } = require('../data/mockData');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD || 'tms@1234';

async function main() {
  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, 10);

  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        password: hashedPassword,
        role: u.role,
        status: u.status,
        lastLogin: u.lastLogin ? new Date(u.lastLogin) : null,
        permissions: u.permissions,
      },
    });
  }

  for (const v of vehicles) {
    await prisma.vehicle.upsert({
      where: { id: v.id },
      update: {},
      create: {
        id: v.id,
        regNumber: v.regNumber,
        make: v.make,
        model: v.model,
        year: v.year,
        category: v.category,
        ownershipType: v.ownershipType,
        capacity: v.capacity,
        fuelType: v.fuelType,
        status: v.status,
        driverId: v.driver,
        odometer: v.odometer,
        location: v.location,
        speed: v.speed,
        lastService: v.lastService,
        insurance: v.insurance,
        fitness: v.fitness,
        permit: v.permit,
        utilization: v.utilization,
        purchasedAgency: v.purchasedAgency,
        vehicleValue: v.vehicleValue,
        emiEnabled: v.emiEnabled,
        monthlyEMI: v.monthlyEMI,
        loanBank: v.loanBank,
      },
    });
  }

  for (const d of drivers) {
    await prisma.driver.upsert({
      where: { id: d.id },
      update: {},
      create: {
        id: d.id,
        name: d.name,
        phone: d.phone,
        altPhone: d.altPhone,
        dob: d.dob,
        address: d.address,
        dlNumber: d.dlNumber,
        licenseCategory: d.licenseCategory,
        licenseExpiry: d.licenseExpiry,
        experience: d.experience,
        emergencyContact: d.emergencyContact,
        status: d.status,
        assignedVehicle: d.assignedVehicle,
        fuelScore: d.fuelScore,
        safetyScore: d.safetyScore,
        onTimeDelivery: d.onTimeDelivery,
        customerRating: d.customerRating,
        totalTrips: d.totalTrips,
        totalKm: d.totalKm,
        violations: d.violations,
        salary: d.salary,
        advance: d.advance,
        attendance: d.attendance,
        aadhaarNumber: d.aadhaarNumber,
        panNumber: d.panNumber,
        supervisorName: d.supervisorName,
        supervisorHistory: d.supervisorHistory,
      },
    });
  }

  for (const t of trips) {
    await prisma.trip.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        voucherNo: t.voucherNo,
        origin: t.origin,
        destination: t.destination,
        stops: t.stops,
        viaStops: t.viaStops,
        status: t.status,
        approvalStatus: t.approvalStatus,
        rejectionReason: t.rejectionReason,
        driverId: t.driverId,
        vehicleId: t.vehicleId,
        customer: t.customer,
        contactPerson: t.contactPerson,
        contactNo: t.contactNo,
        address: t.address,
        category: t.category,
        segment: t.segment,
        businessGroup: t.businessGroup,
        employeeId: t.employeeId,
        placementDate: t.placementDate,
        noOfVehicles: t.noOfVehicles,
        vehicleLoadType: t.vehicleLoadType,
        cargo: t.cargo,
        content: t.content,
        rateType: t.rateType,
        weight: t.weight,
        packages: t.packages,
        rate: t.rate,
        freight: t.freight,
        loadingCharges: t.loadingCharges,
        unloadingCharges: t.unloadingCharges,
        otherCharges: t.otherCharges,
        commission: t.commission,
        advance: t.advance,
        paymentTerms: t.paymentTerms,
        creditDays: t.creditDays,
        total: t.total,
        balance: t.balance,
        volume: t.volume,
        plannedDate: t.plannedDate,
        actualDeparture: t.actualDeparture,
        eta: t.eta,
        distance: t.distance,
        approxTimeHrs: t.approxTimeHrs,
        plannedKm: t.plannedKm,
        actualKm: t.actualKm,
        tollCost: t.tollCost,
        fuelCost: t.fuelCost,
        revenue: t.revenue,
        pod: t.pod,
        delay: t.delay,
        notes: t.notes ?? null,
      },
    });
  }

  console.log(`Seeded ${users.length} users, ${vehicles.length} vehicles, ${drivers.length} drivers, ${trips.length} trips.`);
  console.log(`All seeded users share the password: ${SEED_PASSWORD} (change in production via the users page).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
