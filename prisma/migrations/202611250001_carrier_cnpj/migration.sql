ALTER TABLE "Carrier" ADD COLUMN "cnpj" TEXT;
CREATE UNIQUE INDEX "Carrier_cnpj_key" ON "Carrier"("cnpj");
