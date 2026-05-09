import AsyncStorage from "@react-native-async-storage/async-storage";
import { driverRefreshAccessToken } from "./api";

const SESSION_KEY = "taxi_driver_session";

const ACCESS_REFRESH_SKEW_SEC = 120;

function readJwtExp(accessToken: string): number | null {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const atobFn = globalThis.atob as ((data: string) => string) | undefined;
    if (!atobFn) return null;
    const json = decodeURIComponent(
      Array.from(atobFn(padded), (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
    const p = JSON.parse(json) as { exp?: number };
    return typeof p.exp === "number" ? p.exp : null;
  } catch {
    return null;
  }
}

export interface DriverSession {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string | null; phone: string | null; fullName: string; role: string };
}

const LEGACY_TOKEN_KEY = "driver_access_token";
const LEGACY_NAME_KEY = "driver_full_name";

export async function saveDriverSession(raw: string): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, raw);
  await AsyncStorage.multiRemove([LEGACY_TOKEN_KEY, LEGACY_NAME_KEY]);
}

export async function clearDriverSession(): Promise<void> {
  await AsyncStorage.multiRemove([SESSION_KEY, LEGACY_TOKEN_KEY, LEGACY_NAME_KEY]);
}

export async function getDriverSessionRaw(): Promise<string | null> {
  return AsyncStorage.getItem(SESSION_KEY);
}

let refreshInFlight: Promise<DriverSession | null> | null = null;

export async function tryRefreshDriverSession(): Promise<DriverSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const raw = await getDriverSessionRaw();
        if (!raw) return null;
        let s: DriverSession;
        try {
          s = JSON.parse(raw) as DriverSession;
        } catch {
          await clearDriverSession();
          return null;
        }
        if (!s.refreshToken) {
          await clearDriverSession();
          return null;
        }
        const { accessToken } = await driverRefreshAccessToken(s.refreshToken);
        const next: DriverSession = { ...s, accessToken };
        await saveDriverSession(JSON.stringify(next));
        return next;
      } catch {
        await clearDriverSession();
        return null;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function getDriverSession(): Promise<DriverSession | null> {
  const raw = await getDriverSessionRaw();
  if (!raw) return null;
  let s: DriverSession;
  try {
    s = JSON.parse(raw) as DriverSession;
  } catch {
    await clearDriverSession();
    return null;
  }
  if (!s.accessToken || !s.refreshToken) {
    await clearDriverSession();
    return null;
  }
  if (s.user?.role && s.user.role !== "DRIVER") {
    await clearDriverSession();
    return null;
  }
  const exp = readJwtExp(s.accessToken);
  const now = Math.floor(Date.now() / 1000);
  if (exp != null && exp < now + ACCESS_REFRESH_SKEW_SEC) {
    return tryRefreshDriverSession();
  }
  return s;
}

/** توافق مع كود قديم */
export async function getDriverAccessToken(): Promise<string | null> {
  const s = await getDriverSession();
  return s?.accessToken ?? null;
}

export async function getDriverFullName(): Promise<string | null> {
  const s = await getDriverSession();
  return s?.user?.fullName?.trim() || null;
}
