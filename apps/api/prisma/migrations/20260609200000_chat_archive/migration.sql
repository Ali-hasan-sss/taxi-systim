-- AlterTable
ALTER TABLE "ChatRoom" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "ChatRoom_type_archivedAt_idx" ON "ChatRoom"("type", "archivedAt");
