-- CreateEnum
CREATE TYPE "CommissionPaymentMode" AS ENUM ('POSTPAID', 'PREPAID');

-- AlterEnum
ALTER TYPE "FinancialTransactionType" ADD VALUE 'PREPAID_TOPUP';

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN "paymentMode" "CommissionPaymentMode" NOT NULL DEFAULT 'POSTPAID';

-- CreateTable
CREATE TABLE "PaymentModeSettlement" (
    "id" TEXT NOT NULL,
    "fromMode" "CommissionPaymentMode" NOT NULL,
    "toMode" "CommissionPaymentMode" NOT NULL,
    "createdByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentModeSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentModeSettlementItem" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "remainingDebt" DECIMAL(10,2) NOT NULL,
    "unusedCompensation" DECIMAL(10,2) NOT NULL,
    "unpaidCommission" DECIMAL(10,2) NOT NULL,
    "unpaidFines" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentModeSettlementItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentModeSettlement_createdAt_idx" ON "PaymentModeSettlement"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentModeSettlementItem_settlementId_idx" ON "PaymentModeSettlementItem"("settlementId");

-- CreateIndex
CREATE INDEX "PaymentModeSettlementItem_driverId_idx" ON "PaymentModeSettlementItem"("driverId");

-- AddForeignKey
ALTER TABLE "PaymentModeSettlementItem" ADD CONSTRAINT "PaymentModeSettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "PaymentModeSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentModeSettlementItem" ADD CONSTRAINT "PaymentModeSettlementItem_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
