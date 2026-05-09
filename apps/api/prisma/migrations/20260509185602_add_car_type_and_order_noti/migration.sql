-- CreateEnum
CREATE TYPE "VehicleKind" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "OrderVehicleRequirement" AS ENUM ('ANY', 'PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "vehicleBrand" TEXT,
ADD COLUMN     "vehicleColor" TEXT,
ADD COLUMN     "vehicleKind" "VehicleKind";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "vehicleRequirement" "OrderVehicleRequirement" NOT NULL DEFAULT 'ANY';
