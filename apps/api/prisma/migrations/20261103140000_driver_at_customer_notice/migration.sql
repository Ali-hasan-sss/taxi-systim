-- AlterTable
ALTER TABLE "Order" ADD COLUMN "driverAtCustomerNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "locationLat" DOUBLE PRECISION,
ADD COLUMN "locationLng" DOUBLE PRECISION;
