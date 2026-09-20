-- CreateTable
CREATE TABLE "AppVersionSettings" (
    "id" TEXT NOT NULL,
    "driverMinVersion" TEXT NOT NULL DEFAULT '0.0.0',
    "driverAndroidUrl" TEXT NOT NULL DEFAULT '',
    "driverIosUrl" TEXT NOT NULL DEFAULT '',
    "coordinatorMinVersion" TEXT NOT NULL DEFAULT '0.0.0',
    "coordinatorAndroidUrl" TEXT NOT NULL DEFAULT '',
    "coordinatorIosUrl" TEXT NOT NULL DEFAULT '',
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppVersionSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AppVersionSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
