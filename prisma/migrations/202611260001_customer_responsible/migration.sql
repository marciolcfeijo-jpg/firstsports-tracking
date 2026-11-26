ALTER TABLE "AdminUser" ADD COLUMN "erpSellerCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "erpCode" TEXT, ADD COLUMN "zenlogRecipientId" INTEGER, ADD COLUMN "responsibleId" TEXT;

CREATE UNIQUE INDEX "AdminUser_erpSellerCode_key" ON "AdminUser"("erpSellerCode");
CREATE UNIQUE INDEX "Customer_erpCode_key" ON "Customer"("erpCode");
CREATE UNIQUE INDEX "Customer_zenlogRecipientId_key" ON "Customer"("zenlogRecipientId");
CREATE INDEX "Customer_responsibleId_idx" ON "Customer"("responsibleId");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_responsibleId_fkey"
  FOREIGN KEY ("responsibleId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
