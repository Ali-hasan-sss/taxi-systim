-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('APP', 'WEB_PUBLIC');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'APP';
ALTER TABLE "Order" ADD COLUMN "driversNotifiedAt" TIMESTAMP(3);
