-- Optional commercial assignment to an existing panel user. No permissions change.
ALTER TABLE "Shipment" ADD COLUMN "sellerId" TEXT;
CREATE INDEX "Shipment_sellerId_idx" ON "Shipment"("sellerId");
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
