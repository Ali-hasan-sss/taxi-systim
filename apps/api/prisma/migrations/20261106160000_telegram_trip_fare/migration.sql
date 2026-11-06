ALTER TABLE "SystemSettings" ADD COLUMN "telegramPer100mFare" DECIMAL(10,2) NOT NULL DEFAULT 10;
ALTER TABLE "Order" ADD COLUMN "tripDistanceMeters" INTEGER;
ALTER TABLE "DriverLocationHistory" ADD COLUMN "orderId" TEXT;
CREATE INDEX "DriverLocationHistory_orderId_recordedAt_idx" ON "DriverLocationHistory"("orderId", "recordedAt");
