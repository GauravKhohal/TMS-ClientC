-- CreateTable
CREATE TABLE "ComplianceRecord" (
    "vehicleId" TEXT NOT NULL,
    "rc" JSONB NOT NULL,
    "insurance" JSONB NOT NULL,
    "fitness" JSONB NOT NULL,
    "pollution" JSONB NOT NULL,
    "statePermit" JSONB NOT NULL,
    "nationalPermit" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRecord_pkey" PRIMARY KEY ("vehicleId")
);
