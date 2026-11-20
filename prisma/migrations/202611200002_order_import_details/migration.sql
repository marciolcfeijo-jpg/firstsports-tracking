ALTER TABLE "Order"
  ADD COLUMN "issuedAt" DATE,
  ADD COLUMN "sellerId" TEXT,
  ADD COLUMN "destinationCity" TEXT,
  ADD COLUMN "destinationState" TEXT;

ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Order_sellerId_idx" ON "Order"("sellerId");
