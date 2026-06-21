-- CreateTable
CREATE TABLE "FuelEntry" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "liters" DOUBLE PRECISION NOT NULL,
    "pricePerLiter" DOUBLE PRECISION NOT NULL,
    "totalCost" INTEGER NOT NULL,
    "odometer" INTEGER NOT NULL,
    "kmpl" DOUBLE PRECISION NOT NULL,
    "station" TEXT NOT NULL,
    "fuelCardUsed" BOOLEAN NOT NULL,
    "tripId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelEntry_pkey" PRIMARY KEY ("id")
);
