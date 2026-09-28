-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN "commissionDebtLimit" DECIMAL(10,2) NOT NULL DEFAULT 2000;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN "commissionDebtLimit" DECIMAL(10,2);
