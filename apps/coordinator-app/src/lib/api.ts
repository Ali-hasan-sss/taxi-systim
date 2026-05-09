import Constants from "expo-constants";
import { Platform } from "react-native";
import { mapCoordinatorLoginError, mapRefreshTokenError } from "./auth-errors";

/**
 * المنفذ الافتراضي لـ API في المونوريبو (انظر API_PORT في apps/api).
 * للمحاكي Android بدون إعداد: غالبًا http://10.0.2.2:4000/api
 * للجهاز الحقيقي مع Expo Go: يُشتق IP الحاسوب من خادم التطوير تلقائيًا في وضع التطوير.
 * لتثبيت عنوان يدويًا: EXPO_PUBLIC_API_URL=http://192.168.x.x:4000/api
 */
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

function isLoopbackApiUrl(url: string): boolean {
  try {
    const normalized = url.includes("://") ? url : `http://${url}`;
    const u = new URL(normalized);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
  } catch {
    return false;
  }
}

function resolveApiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (env && !isLoopbackApiUrl(env)) {
    return stripTrailingSlashes(env);
  }

  if (__DEV__) {
    const host = devMachineHostFromExpo();
    if (host) {
      return stripTrailingSlashes(`http://${host}:${API_PORT}/api`);
    }
  }

  if (Platform.OS === "android") {
    return stripTrailingSlashes(`http://10.0.2.2:${API_PORT}/api`);
  }

  return stripTrailingSlashes(`http://localhost:${API_PORT}/api`);
}

const API_BASE = resolveApiBase();

/** يمنع التخزين المؤقت وطلبات If-None-Match التي تُرجع 304 بدون جسم (مشكلة شائعة مع OkHttp على أندرويد) */
function noStoreAuthHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  };
}

/** طلب مصادق؛ عند 401 يُجرى تجديد الرمز مرة واحدة ثم إعادة المحاولة. */
async function coordinatorFetchWithRefresh(
  pathWithSlash: string,
  init: RequestInit,
  accessToken: string
): Promise<Response> {
  const url = `${API_BASE}${pathWithSlash.startsWith("/") ? pathWithSlash : `/${pathWithSlash}`}`;
  const run = (token: string) => {
    const h = new Headers(noStoreAuthHeaders(token));
    if (init.headers) {
      new Headers(init.headers).forEach((value, key) => h.set(key, value));
    }
    return fetch(url, { ...init, headers: h });
  };
  let res = await run(accessToken);
  if (res.status !== 401) return res;
  const sessionMod = await import("./session");
  const next = await sessionMod.tryRefreshCoordinatorSession();
  if (!next) return res;
  return run(next.accessToken);
}

export function getSocketOrigin(): string {
  return stripTrailingSlashes(API_BASE.replace(/\/api$/i, ""));
}

export type OrderBroadcastTarget = "ALL" | "NEAREST_THREE";

export interface CoordinatorLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string | null; phone: string | null; fullName: string; role: string };
}

export async function coordinatorRefreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
  } catch {
    throw new Error("تعذر الاتصال بالخادم لتجديد الجلسة. تحقق من الشبكة.");
  }
  const body = (await res.json().catch(() => ({}))) as { message?: string; accessToken?: string };
  if (!res.ok) {
    throw new Error(mapRefreshTokenError(typeof body.message === "string" ? body.message : ""));
  }
  if (typeof body.accessToken !== "string") {
    throw new Error("استجابة غير صالحة من الخادم عند تجديد الجلسة.");
  }
  return { accessToken: body.accessToken };
}

export async function coordinatorLogin(phone: string, password: string): Promise<CoordinatorLoginResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/coordinator/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password })
    });
  } catch {
    throw new Error(
      "تعذر الاتصال بالخادم. تحقق من الإنترنت، وأن خادم الـ API يعمل، ومن متغير EXPO_PUBLIC_API_URL على الجهاز الحقيقي."
    );
  }
  let parsed: unknown = {};
  try {
    parsed = await res.json();
  } catch {
    /* لا جسم */
  }
  if (!res.ok) {
    const msg =
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof (parsed as { message: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : "";
    throw new Error(mapCoordinatorLoginError(res.status, msg));
  }
  return parsed as CoordinatorLoginResponse;
}

export interface CoordinatorMeResponse {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  role: string;
  /** معرّف صف المنسق في قاعدة البيانات؛ قد يكون null قبل أول طلب */
  coordinatorId: string | null;
}

export async function coordinatorMe(accessToken: string): Promise<CoordinatorMeResponse> {
  const res = await coordinatorFetchWithRefresh(
    `/auth/coordinator/me?t=${Date.now()}`,
    { cache: "no-store" },
    accessToken
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "غير مصرح");
  }
  return res.json() as Promise<CoordinatorMeResponse>;
}

export interface CoordinatorOrderStats {
  active: number;
  pending: number;
  completed: number;
  cancelled: number;
  /** YYYY-MM-DD اليوم المعتمد بتوقيت سوريا (دمشق) لهذه الإحصائية */
  summaryDaySyria?: string;
}

/** ملخص طلبات المنسق لـ«اليوم» بتوقيت سوريا (من منتصف الليل المحلي). */
export async function coordinatorOrderStats(accessToken: string): Promise<CoordinatorOrderStats> {
  const res = await coordinatorFetchWithRefresh(
    `/orders/coordinator/stats?t=${Date.now()}`,
    { cache: "no-store" },
    accessToken
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "فشل تحميل الإحصائيات");
  }
  const data = (await res.json()) as Partial<CoordinatorOrderStats>;
  return {
    active: typeof data.active === "number" ? data.active : 0,
    pending: typeof data.pending === "number" ? data.pending : 0,
    completed: typeof data.completed === "number" ? data.completed : 0,
    cancelled: typeof data.cancelled === "number" ? data.cancelled : 0,
    summaryDaySyria: typeof data.summaryDaySyria === "string" ? data.summaryDaySyria : undefined
  };
}

export interface CoordinatorOrderRow {
  id: string;
  customerName: string;
  customerPhone: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  amount: string;
  status: string;
  broadcastTarget: string;
  createdAt: string;
  driver: null | {
    id: string;
    user: { fullName: string; phone: string | null };
  };
}

export interface LiveDriverDto {
  driverId: string;
  lat: number;
  lng: number;
  fullName: string;
  phone: string | null;
}

export async function coordinatorLiveDrivers(accessToken: string): Promise<LiveDriverDto[]> {
  const res = await coordinatorFetchWithRefresh(`/drivers/live?t=${Date.now()}`, { cache: "no-store" }, accessToken);
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل تحميل السائقين");
  }
  const data = (await res.json()) as { drivers: LiveDriverDto[] };
  return data.drivers;
}

export interface DriverForAssignment {
  id: string;
  fullName: string;
  phone: string | null;
  isOnline: boolean;
  isBusy: boolean;
}

/** بحث سائقين للإسناد؛ لا يُستدعي الخادم إلا مع استعلام بطول ≥ 2 (يُفضّل debounce من الواجهة). */
export async function coordinatorSearchDriversForAssignment(
  accessToken: string,
  q: string,
  signal?: AbortSignal
): Promise<DriverForAssignment[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) {
    return [];
  }
  const path = `/drivers/for-assignment?q=${encodeURIComponent(trimmed)}&t=${Date.now()}`;
  const res = await coordinatorFetchWithRefresh(path, { cache: "no-store", signal }, accessToken);
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل تحميل السائقين");
  }
  const raw = await res.text();
  if (!raw.trim()) {
    return [];
  }
  let data: { drivers?: DriverForAssignment[] };
  try {
    data = JSON.parse(raw) as { drivers?: DriverForAssignment[] };
  } catch {
    throw new Error("استجابة غير صالحة من الخادم");
  }
  const list = data.drivers;
  return Array.isArray(list) ? list : [];
}

export async function coordinatorCancelOrder(accessToken: string, orderId: string): Promise<void> {
  const res = await coordinatorFetchWithRefresh(
    `/orders/${encodeURIComponent(orderId)}/cancel`,
    { method: "PATCH" },
    accessToken
  );
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل إلغاء الطلب");
  }
}

export async function coordinatorAssignOrder(
  accessToken: string,
  orderId: string,
  driverId: string
): Promise<CoordinatorOrderRow> {
  const res = await coordinatorFetchWithRefresh(
    `/orders/${encodeURIComponent(orderId)}/assign`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId })
    },
    accessToken
  );
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل إسناد الطلب");
  }
  return res.json() as Promise<CoordinatorOrderRow>;
}

export type CoordinatorOrdersListScope = "active" | "archive";

export interface CoordinatorOrdersPage {
  orders: CoordinatorOrderRow[];
  nextCursor: string | null;
}

export const COORDINATOR_ORDERS_PAGE_SIZE = 10;

/** `active`: طلبات غير المكتملة وغير الملغاة. `archive`: مكتملة أو ملغاة فقط. ترقيم صفحات عبر `cursor`. */
export async function coordinatorListOrders(
  accessToken: string,
  scope: CoordinatorOrdersListScope = "active",
  opts?: { cursor?: string | null; limit?: number }
): Promise<CoordinatorOrdersPage> {
  const limit = opts?.limit ?? COORDINATOR_ORDERS_PAGE_SIZE;
  const params = new URLSearchParams();
  params.set("scope", scope);
  params.set("limit", String(limit));
  params.set("t", String(Date.now()));
  if (opts?.cursor) {
    params.set("cursor", opts.cursor);
  }
  const res = await coordinatorFetchWithRefresh(`/orders?${params.toString()}`, { cache: "no-store" }, accessToken);
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل تحميل الطلبات");
  }
  const data = (await res.json()) as { orders?: CoordinatorOrderRow[]; nextCursor?: string | null };
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    nextCursor: data.nextCursor ?? null
  };
}

export async function coordinatorCreateOrder(
  accessToken: string,
  body: {
    pickupAddress: string;
    dropoffAddress: string;
    amount: number;
    broadcastTarget: OrderBroadcastTarget;
    customerPhone?: string;
    customerName?: string;
    pickupLat?: number;
    pickupLng?: number;
  }
): Promise<{
  id: string;
  customerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  amount: string;
  broadcastTarget: OrderBroadcastTarget;
  status: string;
}> {
  const res = await coordinatorFetchWithRefresh(
    `/orders`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    accessToken
  );
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل إنشاء الطلب");
  }
  return res.json() as Promise<{
    id: string;
    customerName: string;
    pickupAddress: string;
    dropoffAddress: string;
    amount: string;
    broadcastTarget: OrderBroadcastTarget;
    status: string;
  }>;
}
