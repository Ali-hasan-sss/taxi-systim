import { getSocketOriginFromApiBase, resolveExpoApiBase } from "@taxi/expo-api-base";
import { mapDriverLoginError, mapRefreshTokenError } from "./auth-errors";
import type { DriverSession } from "./session";

const API_BASE = resolveExpoApiBase();

function noStoreAuthHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  };
}

async function driverFetchWithRefresh(
  pathWithSlash: string,
  init: RequestInit,
  accessToken: string
): Promise<Response> {
  const url = `${API_BASE}${pathWithSlash.startsWith("/") ? pathWithSlash : `/${pathWithSlash}`}`;
  const run = (token: string) => {
    const h = new Headers(noStoreAuthHeaders(token));
    if (init.headers) {
      new Headers(init.headers).forEach((value: string, key: string) => h.set(key, value));
    }
    return fetch(url, { ...init, headers: h });
  };
  let res = await run(accessToken);
  if (res.status !== 401) return res;
  const sessionMod = await import("./session");
  const next = await sessionMod.tryRefreshDriverSession();
  if (!next) return res;
  return run(next.accessToken);
}

export interface DriverOrderStats {
  active: number;
  pending: number;
  completed: number;
  cancelled: number;
  /** طلبات مُعلَّمة «متعثرة» اليوم (توقيت سوريا) */
  stuckToday: number;
  /** مجموع العمولة المستحقة (غير المسددة) لطلبات أُكملت اليوم بتوقيت سوريا */
  commissionDueTodaySyria: number;
  /** إجمالي العمولات غير المسددة للسائق */
  unpaidCommissionAmount: number;
  summaryDaySyria?: string;
}

export async function driverRefreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
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

export async function driverLogin(phone: string, password: string): Promise<DriverSession> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
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
    /* empty */
  }
  if (!res.ok) {
    const msg =
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof (parsed as { message: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : "";
    throw new Error(mapDriverLoginError(res.status, msg));
  }
  const body = parsed as {
    accessToken?: string;
    refreshToken?: string;
    user?: { id: string; email?: string | null; phone?: string | null; fullName?: string; role?: string };
  };
  if (body.user?.role !== "DRIVER") {
    throw new Error("هذا الحساب ليس حساب سائق.");
  }
  if (!body.accessToken || !body.refreshToken || !body.user) {
    throw new Error("استجابة غير كاملة من الخادم.");
  }
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    user: {
      id: body.user.id,
      email: body.user.email ?? null,
      phone: body.user.phone ?? null,
      fullName: body.user.fullName ?? "",
      role: body.user.role ?? "DRIVER"
    }
  };
}

export async function fetchDriverOrderStats(accessToken: string): Promise<DriverOrderStats> {
  const res = await driverFetchWithRefresh(`/orders/driver/stats?t=${Date.now()}`, { cache: "no-store" }, accessToken);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "تعذر تحميل الإحصائيات");
  }
  const data = (await res.json()) as Partial<DriverOrderStats>;
  return {
    active: typeof data.active === "number" ? data.active : 0,
    pending: typeof data.pending === "number" ? data.pending : 0,
    completed: typeof data.completed === "number" ? data.completed : 0,
    cancelled: typeof data.cancelled === "number" ? data.cancelled : 0,
    stuckToday: typeof data.stuckToday === "number" ? data.stuckToday : 0,
    commissionDueTodaySyria:
      typeof data.commissionDueTodaySyria === "number" ? data.commissionDueTodaySyria : 0,
    unpaidCommissionAmount: typeof data.unpaidCommissionAmount === "number" ? data.unpaidCommissionAmount : 0,
    summaryDaySyria: typeof data.summaryDaySyria === "string" ? data.summaryDaySyria : undefined
  };
}

export async function driverMarkCustomerBoarded(accessToken: string, orderId: string): Promise<DriverOrderRow> {
  const res = await driverFetchWithRefresh(
    `/orders/${encodeURIComponent(orderId)}/board`,
    { method: "PATCH" },
    accessToken
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "تعذر تأكيد ركوب الزبون");
  }
  return res.json() as Promise<DriverOrderRow>;
}

export async function driverReportCustomerNoShow(accessToken: string, orderId: string): Promise<DriverOrderRow> {
  const res = await driverFetchWithRefresh(
    `/orders/${encodeURIComponent(orderId)}/no-show`,
    { method: "PATCH" },
    accessToken
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "تعذر تسجيل عدم العثور على الزبون");
  }
  return res.json() as Promise<DriverOrderRow>;
}

export type DriverOrderVehicleRequirement = "ANY" | "PUBLIC" | "PRIVATE";

export interface DriverOrderRow {
  id: string;
  driverId?: string | null;
  customerName: string;
  customerPhone: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  amount: string;
  status: string;
  broadcastTarget: string;
  vehicleRequirement?: DriverOrderVehicleRequirement;
  notes?: string | null;
  createdAt: string;
  driver: null | {
    id: string;
    user: { fullName: string; phone: string | null };
    vehicleBrand?: string | null;
    vehicleColor?: string | null;
    vehicleNumber?: string | null;
    vehicleKind?: "PUBLIC" | "PRIVATE" | null;
  };
  commission?: null | {
    calculatedCommission: string;
    paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
    remainingAmount: string;
  };
}

export type DriverOrdersScope = "active" | "archive";

/** شريحة أرشيف السائق (تبويب) — ترقيم 10 لكل شريحة */
export type DriverArchiveSegment = "completed" | "cancelled" | "stuck";

export interface DriverOrdersPage {
  orders: DriverOrderRow[];
  nextCursor: string | null;
}

export interface DriverOrdersReportSummary {
  orderCount: number;
  totalAmount: string;
  totalCommission: string;
  from: string;
  to: string;
}

export interface DriverOrdersReportPage {
  orders: DriverOrderRow[];
  nextCursor: string | null;
  summary: DriverOrdersReportSummary;
}

export interface DriverProfile {
  id: string;
  isBusy: boolean;
  isOnline: boolean;
}

export async function fetchDriverProfile(accessToken: string): Promise<DriverProfile> {
  const res = await driverFetchWithRefresh("/drivers/me", { cache: "no-store" }, accessToken);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "تعذر تحميل بيانات السائق");
  }
  return res.json() as Promise<DriverProfile>;
}

export interface DriverOrderRoomResponse {
  inProgress: DriverOrderRow | null;
  pending: DriverOrderRow[];
}

export async function fetchDriverOrderRoom(accessToken: string): Promise<DriverOrderRoomResponse> {
  const res = await driverFetchWithRefresh(
    `/orders/driver/room?t=${Date.now()}`,
    { cache: "no-store" },
    accessToken
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "تعذر تحميل غرفة الطلبات");
  }
  return res.json() as Promise<DriverOrderRoomResponse>;
}

export async function driverAcceptOrder(accessToken: string, orderId: string): Promise<DriverOrderRow> {
  const res = await driverFetchWithRefresh(
    `/orders/${encodeURIComponent(orderId)}/accept`,
    { method: "PATCH" },
    accessToken
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "تعذر قبول الطلب");
  }
  return res.json() as Promise<DriverOrderRow>;
}

export async function driverCompleteOrder(accessToken: string, orderId: string): Promise<DriverOrderRow> {
  const res = await driverFetchWithRefresh(
    `/orders/${encodeURIComponent(orderId)}/complete`,
    { method: "PATCH" },
    accessToken
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "تعذر إكمال التوصيل");
  }
  return res.json() as Promise<DriverOrderRow>;
}

/** حمولة أحداث السوكيت للطلب (مطابقة للخادم) */
export interface DriverSocketOrderPayload {
  orderId: string;
  coordinatorId: string;
  driverId: string | null;
  customerName: string;
  customerPhone: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  amount: number;
  status: string;
  broadcastTarget: string;
  vehicleRequirement: DriverOrderVehicleRequirement;
  notes: string | null;
  createdAt: string;
}

export function socketPayloadToDriverOrderRow(p: DriverSocketOrderPayload): DriverOrderRow {
  return {
    id: p.orderId,
    customerName: p.customerName,
    customerPhone: p.customerPhone,
    pickupAddress: p.pickupAddress,
    dropoffAddress: p.dropoffAddress,
    amount: String(p.amount),
    status: p.status,
    broadcastTarget: p.broadcastTarget,
    vehicleRequirement: p.vehicleRequirement ?? "ANY",
    notes: p.notes ?? null,
    createdAt: p.createdAt,
    driver: p.driverId
      ? { id: p.driverId, user: { fullName: "", phone: null } }
      : null
  };
}

export async function driverListOrders(
  accessToken: string,
  scope: DriverOrdersScope,
  opts?: { cursor?: string | null; limit?: number; archiveSegment?: DriverArchiveSegment }
): Promise<DriverOrdersPage> {
  const params = new URLSearchParams({ scope, t: String(Date.now()) });
  if (opts?.cursor) params.set("cursor", opts.cursor);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (scope === "archive" && opts?.archiveSegment) {
    params.set("archiveSegment", opts.archiveSegment);
  }
  const res = await driverFetchWithRefresh(
    `/orders/driver/orders?${params.toString()}`,
    { cache: "no-store" },
    accessToken
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "تعذر تحميل الطلبات");
  }
  return res.json() as Promise<DriverOrdersPage>;
}

export async function driverOrdersReport(
  accessToken: string,
  opts?: {
    from?: string;
    to?: string;
    cursor?: string | null;
    limit?: number;
  }
): Promise<DriverOrdersReportPage> {
  const params = new URLSearchParams({ t: String(Date.now()) });
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  if (opts?.cursor) params.set("cursor", opts.cursor);
  params.set("limit", String(opts?.limit ?? 20));

  const res = await driverFetchWithRefresh(
    `/orders/driver/reports?${params.toString()}`,
    { cache: "no-store" },
    accessToken
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "تعذر تحميل التقرير");
  }
  const data = (await res.json()) as {
    orders?: DriverOrderRow[];
    nextCursor?: string | null;
    summary?: Partial<DriverOrdersReportSummary>;
  };
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    nextCursor: data.nextCursor ?? null,
    summary: {
      orderCount: typeof data.summary?.orderCount === "number" ? data.summary.orderCount : 0,
      totalAmount: typeof data.summary?.totalAmount === "string" ? data.summary.totalAmount : "0.00",
      totalCommission: typeof data.summary?.totalCommission === "string" ? data.summary.totalCommission : "0.00",
      from: typeof data.summary?.from === "string" ? data.summary.from : "",
      to: typeof data.summary?.to === "string" ? data.summary.to : ""
    }
  };
}

export function getSocketOrigin(): string {
  return getSocketOriginFromApiBase(API_BASE);
}

export async function registerExpoPushToken(accessToken: string, expoToken: string): Promise<void> {
  const res = await driverFetchWithRefresh(
    "/auth/push-token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: expoToken })
    },
    accessToken
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "تعذر تسجيل إشعارات الجهاز");
  }
}

export async function clearExpoPushToken(accessToken: string): Promise<void> {
  await driverFetchWithRefresh("/auth/push-token", { method: "DELETE" }, accessToken);
}
