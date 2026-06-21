-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "placementConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "placementDateTime" TEXT,
ADD COLUMN "placementRemarks" TEXT,
ADD COLUMN "cnNumber" TEXT,
ADD COLUMN "cnDate" TEXT,
ADD COLUMN "consigneeName" TEXT,
ADD COLUMN "consigneeAddress" TEXT,
ADD COLUMN "consigneeContact" TEXT;
