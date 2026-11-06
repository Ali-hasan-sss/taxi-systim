ALTER TABLE "SystemSettings" ADD COLUMN "telegramBotEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "TelegramSubscriber" (
    "chatId" TEXT NOT NULL,
    "awaitingResumeNotice" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSubscriber_pkey" PRIMARY KEY ("chatId")
);
