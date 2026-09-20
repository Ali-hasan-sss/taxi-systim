import { prisma } from "./prisma";

const SETTINGS_ID = "default";
const VERSION_RE = /^\d+\.\d+\.\d+$/;

export type AppVersionPolicy = {
  minVersion: string;
  androidUrl: string;
  iosUrl: string;
};

export type PublicAppConfig = {
  driver: AppVersionPolicy;
  coordinator: AppVersionPolicy;
};

export function isValidAppVersion(value: string): boolean {
  return VERSION_RE.test(value.trim());
}

export const APP_UPDATE_REQUIRED_MESSAGE = "يجب تحديث التطبيق للمتابعة.";
export const APP_UPDATE_REQUIRED_CODE = "APP_UPDATE_REQUIRED";
export const APP_UPDATE_REQUIRED_STATUS = 426;

export type MobileAppKind = "driver" | "coordinator";

function parseVersionParts(value: string): number[] {
  return value.split(/[.+-]/).map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

export function isAppVersionBelowMin(currentVersion: string, minVersion: string): boolean {
  const min = minVersion.trim();
  if (!min || min === "0.0.0") return false;
  const current = parseVersionParts(currentVersion.trim() || "0.0.0");
  const required = parseVersionParts(min);
  const len = Math.max(current.length, required.length);
  for (let i = 0; i < len; i++) {
    const diff = (current[i] ?? 0) - (required[i] ?? 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
}

export async function evaluateMobileAppVersion(
  kind: MobileAppKind,
  currentVersion: string | null | undefined
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const config = await getPublicAppConfig();
    const min = config[kind].minVersion;
    if (!min || min === "0.0.0") return { ok: true };
    if (!currentVersion?.trim() || isAppVersionBelowMin(currentVersion, min)) {
      return { ok: false, message: APP_UPDATE_REQUIRED_MESSAGE };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export async function evaluateUnknownMobileAppVersion(
  currentVersion: string | null | undefined
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const config = await getPublicAppConfig();
    const activeKinds = (["driver", "coordinator"] as const).filter(
      (kind) => config[kind].minVersion && config[kind].minVersion !== "0.0.0"
    );
    if (activeKinds.length === 0) return { ok: true };
    if (!currentVersion?.trim()) {
      return { ok: false, message: APP_UPDATE_REQUIRED_MESSAGE };
    }
    for (const kind of activeKinds) {
      if (isAppVersionBelowMin(currentVersion, config[kind].minVersion)) {
        return { ok: false, message: APP_UPDATE_REQUIRED_MESSAGE };
      }
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

function normalizeVersion(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw === "0" || raw === "0.0.0") return "0.0.0";
  return raw;
}

function normalizeUrl(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidStoreUrl(value: string): boolean {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function toPolicy(row: {
  driverMinVersion: string;
  driverAndroidUrl: string;
  driverIosUrl: string;
  coordinatorMinVersion: string;
  coordinatorAndroidUrl: string;
  coordinatorIosUrl: string;
}): PublicAppConfig {
  return {
    driver: {
      minVersion: row.driverMinVersion,
      androidUrl: row.driverAndroidUrl,
      iosUrl: row.driverIosUrl
    },
    coordinator: {
      minVersion: row.coordinatorMinVersion,
      androidUrl: row.coordinatorAndroidUrl,
      iosUrl: row.coordinatorIosUrl
    }
  };
}

export async function getAppVersionSettings() {
  return prisma.appVersionSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {}
  });
}

export async function getPublicAppConfig(): Promise<PublicAppConfig> {
  const row = await getAppVersionSettings();
  return toPolicy(row);
}

export async function updateAppVersionSettings(
  payload: {
    driverMinVersion?: string;
    driverAndroidUrl?: string;
    driverIosUrl?: string;
    coordinatorMinVersion?: string;
    coordinatorAndroidUrl?: string;
    coordinatorIosUrl?: string;
  },
  updatedByUserId?: string
) {
  const current = await getAppVersionSettings();
  const next = {
    driverMinVersion: payload.driverMinVersion !== undefined
      ? normalizeVersion(payload.driverMinVersion)
      : current.driverMinVersion,
    driverAndroidUrl: payload.driverAndroidUrl !== undefined
      ? normalizeUrl(payload.driverAndroidUrl)
      : current.driverAndroidUrl,
    driverIosUrl: payload.driverIosUrl !== undefined ? normalizeUrl(payload.driverIosUrl) : current.driverIosUrl,
    coordinatorMinVersion: payload.coordinatorMinVersion !== undefined
      ? normalizeVersion(payload.coordinatorMinVersion)
      : current.coordinatorMinVersion,
    coordinatorAndroidUrl: payload.coordinatorAndroidUrl !== undefined
      ? normalizeUrl(payload.coordinatorAndroidUrl)
      : current.coordinatorAndroidUrl,
    coordinatorIosUrl: payload.coordinatorIosUrl !== undefined
      ? normalizeUrl(payload.coordinatorIosUrl)
      : current.coordinatorIosUrl,
    updatedByUserId: updatedByUserId ?? current.updatedByUserId
  };

  for (const version of [next.driverMinVersion, next.coordinatorMinVersion]) {
    if (!isValidAppVersion(version)) {
      throw new Error("صيغة رقم النسخة غير صالحة. استخدم مثل 1.0.12");
    }
  }
  for (const url of [
    next.driverAndroidUrl,
    next.driverIosUrl,
    next.coordinatorAndroidUrl,
    next.coordinatorIosUrl
  ]) {
    if (!isValidStoreUrl(url)) {
      throw new Error("رابط التحميل يجب أن يبدأ بـ http:// أو https://");
    }
  }

  return prisma.appVersionSettings.update({
    where: { id: SETTINGS_ID },
    data: next
  });
}
