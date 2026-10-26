-- AlterTable
ALTER TABLE "Carrier" ADD COLUMN     "syncLeaseToken" TEXT,
ADD COLUMN     "syncLeaseUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "destinationCity" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "destinationState" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "leaseUntil" TIMESTAMP(3);

