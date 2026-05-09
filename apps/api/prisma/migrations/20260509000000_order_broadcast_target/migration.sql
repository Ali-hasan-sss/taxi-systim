-- CreateEnum
CREATE TYPE "OrderBroadcastTarget" AS ENUM ('ALL', 'NEAREST_THREE');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "broadcastTarget" "OrderBroadcastTarget" NOT NULL DEFAULT 'ALL';
