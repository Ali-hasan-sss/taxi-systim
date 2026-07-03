import AsyncStorage from "@react-native-async-storage/async-storage";
import { coordinatorRefreshAccessToken } from "./api";
import { isPermanentRefreshFailure } from "./coordinator-auth";

const SESSION_KEY = "taxi_coordinator_session";

/** ثوانٍ قبل انتهاء صلاحية access token نحاول تجديده تلقائيًا */
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

export async function saveSession(raw: string): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, raw);
  const { useCoordinatorStore } = await import("../store");
  useCoordinatorStore.getState().bumpAuthEpoch();
}

async function persistSessionTokens(session: CoordinatorSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
  const { useCoordinatorStore } = await import("../store");
  useCoordinatorStore.getState().bumpAuthEpoch();
}

export async function getSessionRaw(): Promise<string | null> {
  return AsyncStorage.getItem(SESSION_KEY);
}

export interface CoordinatorSession {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string | null; phone: string | null; fullName: string; role: string };
}

let refreshInFlight: Promise<CoordinatorSession | null> | null = null;

/** تجديد access token من التخزين؛ عند الفشل تُمسح الجلسة. يُستخدم عند 401 أو قبل انتهاء الصلاحية. */
export async function tryRefreshCoordinatorSession(): Promise<CoordinatorSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const raw = await getSessionRaw();
        if (!raw) return null;
        let s: CoordinatorSession;
        try {
          s = JSON.parse(raw) as CoordinatorSession;
        } catch {
          await clearSession();
          return null;
        }
        if (!s.refreshToken) {
          await clearSession();
          return null;
        }
        const { accessToken } = await coordinatorRefreshAccessToken(s.refreshToken);
        const next: CoordinatorSession = { ...s, accessToken };
        await persistSessionTokens(next);
        return next;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (isPermanentRefreshFailure(msg)) {
          await clearSession();
          return null;
        }
        try {
          const raw = await getSessionRaw();
          if (!raw) return null;
          return JSON.parse(raw) as CoordinatorSession;
        } catch {
          return null;
        }
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function getSession(): Promise<CoordinatorSession | null> {
  const raw = await getSessionRaw();
  if (!raw) return null;
  let s: CoordinatorSession;
  try {
    s = JSON.parse(raw) as CoordinatorSession;
  } catch {
    await clearSession();
    return null;
  }
  if (!s.accessToken || !s.refreshToken) {
    await clearSession();
    return null;
  }
  const exp = readJwtExp(s.accessToken);
  const now = Math.floor(Date.now() / 1000);
  if (exp != null && exp < now + ACCESS_REFRESH_SKEW_SEC) {
    return tryRefreshCoordinatorSession();
  }
  return s;
}
