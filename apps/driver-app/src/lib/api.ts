import Constants from "expo-constants";
import { Platform } from "react-native";

const API_PORT = 4000;

function stripTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

function devMachineHostFromExpo(): string | null {
  const uri = Constants.expoConfig?.hostUri;
  if (!uri) return null;
  const host = uri.split(":")[0]?.trim();
  return host || null;
}

function resolveApiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (env) return stripTrailingSlashes(env);
  if (__DEV__) {
    const host = devMachineHostFromExpo();
    if (host) return stripTrailingSlashes(`http://${host}:${API_PORT}/api`);
  }
  if (Platform.OS === "android") {
    return stripTrailingSlashes(`http://10.0.2.2:${API_PORT}/api`);
  }
  return stripTrailingSlashes(`http://localhost:${API_PORT}/api`);
}

export const API_BASE = resolveApiBase();

export interface DriverOrderStats {
  active: number;
  pending: number;
  completed: number;
  cancelled: number;
}

export async function fetchDriverOrderStats(accessToken: string): Promise<DriverOrderStats> {
  const res = await fetch(`${API_BASE}/orders/driver/stats?t=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    }
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "تعذر تحميل الإحصائيات");
  }
  const data = (await res.json()) as Partial<DriverOrderStats>;
  return {
    active: typeof data.active === "number" ? data.active : 0,
    pending: typeof data.pending === "number" ? data.pending : 0,
    completed: typeof data.completed === "number" ? data.completed : 0,
    cancelled: typeof data.cancelled === "number" ? data.cancelled : 0
  };
}

export async function driverLogin(
  phone: string,
  password: string
): Promise<{ accessToken: string; fullName: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password })
  });
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
    accessToken?: string;
    user?: { role?: string; fullName?: string };
  };
  if (!res.ok) {
    throw new Error(body.message ?? "فشل تسجيل الدخول");
  }
  if (body.user?.role !== "DRIVER") {
    throw new Error("هذا الحساب ليس حساب سائق");
  }
  if (!body.accessToken) {
    throw new Error("لم يُعاد رمز الدخول");
  }
  return { accessToken: body.accessToken, fullName: body.user?.fullName ?? "" };
}
