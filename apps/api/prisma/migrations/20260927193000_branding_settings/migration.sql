-- CreateTable
CREATE TABLE "BrandingSettings" (
    "id" TEXT NOT NULL,
    "logoFile" TEXT NOT NULL DEFAULT '',
    "logoUpdatedAt" TIMESTAMP(3),
    "coordinatorBackgroundFile" TEXT NOT NULL DEFAULT '',
    "coordinatorBackgroundUpdatedAt" TIMESTAMP(3),
    "driverBackgroundFile" TEXT NOT NULL DEFAULT '',
    "driverBackgroundUpdatedAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandingSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BrandingSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
