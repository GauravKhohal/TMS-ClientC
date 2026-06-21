-- CreateTable
CREATE TABLE "PettyCash" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "tripRoute" TEXT NOT NULL,
    "issueDate" TEXT NOT NULL,
    "cashIssued" INTEGER NOT NULL,
    "expenses" JSONB NOT NULL,
    "totalSpent" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "settledDate" TEXT,
    "notes" TEXT NOT NULL,
    "transferStatus" TEXT NOT NULL,
    "transferAmount" INTEGER NOT NULL,
    "transferMode" TEXT NOT NULL,
    "payoutId" TEXT,
    "payoutTime" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PettyCash_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FastagAccount" (
    "vehicleId" TEXT NOT NULL,
    "regNumber" TEXT NOT NULL,
    "fastagId" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "balance" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "lastTransaction" TEXT NOT NULL,

    CONSTRAINT "FastagAccount_pkey" PRIMARY KEY ("vehicleId")
);

-- CreateTable
CREATE TABLE "FastagTransaction" (
    "txnId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "regNumber" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "plaza" TEXT NOT NULL,
    "highway" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "timestamp" TEXT NOT NULL,
    "tripId" TEXT,
    "matched" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FastagTransaction_pkey" PRIMARY KEY ("txnId")
);

-- CreateTable
CREATE TABLE "PayoutPool" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "totalLoaded" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "lowBalanceThreshold" INTEGER NOT NULL,

    CONSTRAINT "PayoutPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SparePart" (
    "id" TEXT NOT NULL,
    "partNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL,
    "reorderLevel" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "vendor" TEXT NOT NULL,
    "location" TEXT NOT NULL,

    CONSTRAINT "SparePart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpareLedgerEntry" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "vehicleId" TEXT,
    "regNumber" TEXT,
    "reference" TEXT NOT NULL,
    "vendor" TEXT,
    "unitPrice" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpareLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tyre" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "regNumber" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "purchasePrice" INTEGER NOT NULL,
    "currentKmRun" INTEGER NOT NULL,
    "retreads" INTEGER NOT NULL,
    "vendor" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expectedLifeKm" INTEGER NOT NULL,
    "warrantyExpiry" TEXT,
    "warrantyKm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tyre_pkey" PRIMARY KEY ("id")
);
