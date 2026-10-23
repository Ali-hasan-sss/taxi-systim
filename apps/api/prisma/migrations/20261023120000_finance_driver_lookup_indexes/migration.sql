-- CreateIndex
CREATE INDEX "Commission_driverId_idx" ON "Commission"("driverId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_driverId_type_referenceId_idx" ON "FinancialTransaction"("driverId", "type", "referenceId");
