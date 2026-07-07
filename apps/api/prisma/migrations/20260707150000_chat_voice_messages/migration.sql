-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "voicePath" TEXT,
ADD COLUMN "voiceExpiresAt" TIMESTAMP(3),
ADD COLUMN "voiceDurationMs" INTEGER;
