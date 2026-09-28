import fs from "node:fs";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { deleteBrandingFile, safeBrandingPath } from "./branding-upload";

const SETTINGS_ID = "default";
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export type BrandingSlot = "logo" | "coordinator-background" | "driver-background";

export type BrandingAssetDto = {
  url: string | null;
  version: string | null;
};

export type BrandingDto = {
  appName: string;
  logo: BrandingAssetDto;
  coordinatorBackground: BrandingAssetDto;
  driverBackground: BrandingAssetDto;
};

const SLOT_FIELDS: Record<
  BrandingSlot,
  { file: "logoFile" | "coordinatorBackgroundFile" | "driverBackgroundFile"; at: "logoUpdatedAt" | "coordinatorBackgroundUpdatedAt" | "driverBackgroundUpdatedAt" }
> = {
  logo: { file: "logoFile", at: "logoUpdatedAt" },
  "coordinator-background": { file: "coordinatorBackgroundFile", at: "coordinatorBackgroundUpdatedAt" },
  "driver-background": { file: "driverBackgroundFile", at: "driverBackgroundUpdatedAt" }
};

/** صف الإعدادات الوحيد. يُنشأ عند أول قراءة بعد توليد عميل قاعدة البيانات. */
async function ensureBrandingSettings() {
  return prisma.brandingSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {}
  });
}

function toAsset(apiBase: string, file: string, updatedAt: Date | null): BrandingAssetDto {
  if (!file) return { url: null, version: null };
  return {
    url: `${apiBase}/public/branding/files/${encodeURIComponent(file)}`,
    version: updatedAt ? updatedAt.toISOString() : file
  };
}

const APP_NAME_MAX = 48;

export function toBrandingDto(
  row: {
    appName: string;
    logoFile: string;
    logoUpdatedAt: Date | null;
    coordinatorBackgroundFile: string;
    coordinatorBackgroundUpdatedAt: Date | null;
    driverBackgroundFile: string;
    driverBackgroundUpdatedAt: Date | null;
  },
  apiBase: string
): BrandingDto {
  return {
    appName: row.appName.trim(),
    logo: toAsset(apiBase, row.logoFile, row.logoUpdatedAt),
    coordinatorBackground: toAsset(apiBase, row.coordinatorBackgroundFile, row.coordinatorBackgroundUpdatedAt),
    driverBackground: toAsset(apiBase, row.driverBackgroundFile, row.driverBackgroundUpdatedAt)
  };
}

export async function getBranding(apiBase: string): Promise<BrandingDto> {
  const row = await ensureBrandingSettings();
  return toBrandingDto(row, apiBase);
}

export async function updateAppName(
  appNameRaw: string,
  updatedByUserId: string | undefined,
  apiBase: string
): Promise<BrandingDto> {
  const appName = appNameRaw.replace(/\s+/g, " ").trim();
  if (appName.length > APP_NAME_MAX) {
    throw new AppError(`اسم التطبيق يجب ألا يتجاوز ${APP_NAME_MAX} حرفًا`, 400);
  }
  const current = await ensureBrandingSettings();
  const updated = await prisma.brandingSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      appName,
      updatedByUserId: updatedByUserId ?? current.updatedByUserId
    }
  });
  return toBrandingDto(updated, apiBase);
}

export async function replaceBrandingFile(
  slot: BrandingSlot,
  filename: string,
  size: number,
  updatedByUserId: string | undefined,
  apiBase: string
): Promise<BrandingDto> {
  if (slot === "logo" && size > LOGO_MAX_BYTES) {
    throw new AppError("حجم اللوجو يجب ألا يتجاوز 2 ميغابايت", 400);
  }

  const fields = SLOT_FIELDS[slot];
  const current = await ensureBrandingSettings();
  const previous = current[fields.file];
  const updated = await prisma.brandingSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      [fields.file]: filename,
      [fields.at]: new Date(),
      updatedByUserId: updatedByUserId ?? current.updatedByUserId
    }
  });

  if (previous && previous !== filename) {
    try {
      deleteBrandingFile(previous);
    } catch (error) {
      console.error("[branding] failed to delete previous file", previous, error);
    }
  }

  return toBrandingDto(updated, apiBase);
}

export async function resolveBrandingFile(filename: string): Promise<string> {
  const row = await ensureBrandingSettings();
  let safeName = filename;
  try {
    safeName = decodeURIComponent(filename);
  } catch {
    safeName = filename;
  }
  safeName = safeName.split("/").pop() ?? "";
  const allowed = new Set(
    [row.logoFile, row.coordinatorBackgroundFile, row.driverBackgroundFile].filter((name) => name.length > 0)
  );
  if (!allowed.has(safeName)) {
    throw new AppError("الصورة غير موجودة", 404);
  }
  const full = safeBrandingPath(safeName);
  if (!full || !fs.existsSync(full)) {
    throw new AppError("الصورة غير موجودة", 404);
  }
  return full;
}
