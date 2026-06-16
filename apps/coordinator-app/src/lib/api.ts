import { getSocketOriginFromApiBase, resolveExpoApiBase } from "@taxi/expo-api-base";
import { mapCoordinatorLoginError, mapRefreshTokenError } from "./auth-errors";

const API_BASE = resolveExpoApiBase();

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
  return getSocketOriginFromApiBase(API_BASE);
}

export type OrderBroadcastTarget = "ALL" | "NEAREST_THREE";

/** متطلب نوع السيارة للطلب (افتراضي الخادم: ANY = غير مهم) */
export type OrderVehicleRequirement = "ANY" | "PUBLIC" | "PRIVATE" | "VIP";

export type DriverVehicleKind = "PUBLIC" | "PRIVATE" | "VIP";

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

export async function coordinatorChangePassword(
  accessToken: string,
  payload: { currentPassword: string; newPassword: string }
): Promise<void> {
  const res = await coordinatorFetchWithRefresh(
    "/auth/coordinator/change-password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    accessToken
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "فشل تغيير كلمة المرور");
  }
}

export interface CoordinatorOrderFilterCounts {
  all: number;
  needs_info: number;
  needs_invoice: number;
  stuck: number;
  pending: number;
  completed: number;
}

export interface CoordinatorOrderStats {
  active: number;
  pending: number;
  completed: number;
  cancelled: number;
  /** طلبات «متعثرة» سُجِّلت اليوم (توقيت سوريا) */
  stuckToday: number;
  /** طلبات STUCK الحالية للمنسق (للشارات) */
  stuckActive?: number;
  /** YYYY-MM-DD اليوم المعتمد بتوقيت سوريا (دمشق) لهذه الإحصائية */
  summaryDaySyria?: string;
  /** أعداد التبويبات في صفحة الطلبات */
  filterCounts?: CoordinatorOrderFilterCounts;
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
    stuckToday: typeof data.stuckToday === "number" ? data.stuckToday : 0,
    stuckActive: typeof data.stuckActive === "number" ? data.stuckActive : undefined,
    summaryDaySyria: typeof data.summaryDaySyria === "string" ? data.summaryDaySyria : undefined,
    filterCounts:
      data.filterCounts && typeof data.filterCounts === "object"
        ? {
            all: Number(data.filterCounts.all) || 0,
            needs_info: Number(data.filterCounts.needs_info) || 0,
            needs_invoice: Number(data.filterCounts.needs_invoice) || 0,
            stuck: Number(data.filterCounts.stuck) || 0,
            pending: Number(data.filterCounts.pending) || 0,
            completed: Number(data.filterCounts.completed) || 0
          }
        : undefined
  };
}

export interface CoordinatorOrderRow {
  id: string;
  /** مُسند حتى لو غاب كائن `driver` في الاستجابة */
  driverId?: string | null;
  customerName: string;
  customerPhone: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  amount: string;
  status: string;
  broadcastTarget: string;
  /** يُعرَض كـ «غير مهم» إن غاب من استجابات قديمة */
  vehicleRequirement?: OrderVehicleRequirement;
  notes?: string | null;
  createdAt: string;
  customerInfoSentAt?: string | null;
  invoiceSentAt?: string | null;
  driver: null | {
    id: string;
    user: { fullName: string; phone: string | null };
    vehicleBrand?: string | null;
    vehicleColor?: string | null;
    vehicleNumber?: string | null;
    vehicleKind?: DriverVehicleKind | null;
  };
}

export interface LiveDriverDto {
  driverId: string;
  lat: number | null;
  lng: number | null;
  fullName: string;
  phone: string | null;
  /** مشغول بطلب قيد التنفيذ */
  isBusy: boolean;
}

export type LiveDriverStatusFilter = "all" | "available" | "busy";

export interface LiveDriversPage {
  drivers: LiveDriverDto[];
  total: number;
  nextOffset: number | null;
}

export async function coordinatorLiveDrivers(
  accessToken: string,
  opts?: { q?: string; limit?: number; offset?: number; status?: LiveDriverStatusFilter }
): Promise<LiveDriversPage> {
  const params = new URLSearchParams({ t: String(Date.now()) });
  if (typeof opts?.q === "string" && opts.q.trim()) {
    params.set("q", opts.q.trim());
  }
  if (typeof opts?.limit === "number") {
    params.set("limit", String(opts.limit));
  }
  if (typeof opts?.offset === "number") {
    params.set("offset", String(opts.offset));
  }
  if (opts?.status && opts.status !== "all") {
    params.set("status", opts.status);
  }
  const res = await coordinatorFetchWithRefresh(`/drivers/live?${params.toString()}`, { cache: "no-store" }, accessToken);
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل تحميل السائقين");
  }
  const data = (await res.json()) as Partial<LiveDriversPage>;
  return {
    drivers: Array.isArray(data.drivers) ? data.drivers : [],
    total: typeof data.total === "number" ? data.total : 0,
    nextOffset: typeof data.nextOffset === "number" ? data.nextOffset : null
  };
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

/** إعادة طلب متعثر لنفس السائق إلى «في الطريق إلى الزبون». */
export async function coordinatorResumeStuckOrder(
  accessToken: string,
  orderId: string
): Promise<CoordinatorOrderRow> {
  const res = await coordinatorFetchWithRefresh(
    `/orders/${encodeURIComponent(orderId)}/resume-stuck`,
    { method: "PATCH" },
    accessToken
  );
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل إعادة الطلب للسائق");
  }
  return res.json() as Promise<CoordinatorOrderRow>;
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

/** تعديل أجرة الطلب (نشط أو مكتمل). يعيد صف الطلب كما في القائمة. */
export async function coordinatorUpdateCompletedOrderAmount(
  accessToken: string,
  orderId: string,
  amount: number
): Promise<CoordinatorOrderRow> {
  const res = await coordinatorFetchWithRefresh(
    `/orders/${encodeURIComponent(orderId)}/amount`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount })
    },
    accessToken
  );
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل تعديل المبلغ");
  }
  return res.json() as Promise<CoordinatorOrderRow>;
}

export async function coordinatorMarkCustomerInfoSent(
  accessToken: string,
  orderId: string
): Promise<CoordinatorOrderRow> {
  const res = await coordinatorFetchWithRefresh(
    `/orders/${encodeURIComponent(orderId)}/mark-customer-info-sent`,
    { method: "PATCH" },
    accessToken
  );
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل تسجيل إرسال المعلومات");
  }
  return res.json() as Promise<CoordinatorOrderRow>;
}

export async function coordinatorMarkInvoiceSent(
  accessToken: string,
  orderId: string
): Promise<CoordinatorOrderRow> {
  const res = await coordinatorFetchWithRefresh(
    `/orders/${encodeURIComponent(orderId)}/mark-invoice-sent`,
    { method: "PATCH" },
    accessToken
  );
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل تسجيل إرسال الفاتورة");
  }
  return res.json() as Promise<CoordinatorOrderRow>;
}

export type CoordinatorOrdersListScope = "active" | "archive";

/** تبويب طلباتي */
export type CoordinatorActiveOrdersSegment =
  | "pending"
  | "in_progress"
  | "stuck"
  | "needs_info"
  | "needs_invoice"
  | "completed";

/** الأرشيف: مكتمل أو ملغى */
export type CoordinatorArchiveOrdersSegment = "completed" | "cancelled";

export interface CoordinatorOrdersPage {
  orders: CoordinatorOrderRow[];
  nextCursor: string | null;
}

export interface CoordinatorOrdersReportSummary {
  orderCount: number;
  totalAmount: string;
  from: string;
  to: string;
}

export interface CoordinatorOrdersReportPage {
  orders: CoordinatorOrderRow[];
  nextCursor: string | null;
  summary: CoordinatorOrdersReportSummary;
}

export const COORDINATOR_ORDERS_PAGE_SIZE = 10;

/** `active`: طلبات غير المكتملة وغير الملغاة. `archive`: مكتملة أو ملغاة فقط. ترقيم صفحات عبر `cursor`. */
export async function coordinatorListOrders(
  accessToken: string,
  scope: CoordinatorOrdersListScope = "active",
  opts?: {
    cursor?: string | null;
    limit?: number;
    /** مع `active`: pending | in_progress | stuck. مع `archive`: completed | cancelled */
    segment?: CoordinatorActiveOrdersSegment | CoordinatorArchiveOrdersSegment;
  }
): Promise<CoordinatorOrdersPage> {
  const limit = opts?.limit ?? COORDINATOR_ORDERS_PAGE_SIZE;
  const params = new URLSearchParams();
  params.set("scope", scope);
  params.set("limit", String(limit));
  params.set("t", String(Date.now()));
  if (opts?.cursor) {
    params.set("cursor", opts.cursor);
  }
  if (opts?.segment) {
    params.set("segment", opts.segment);
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

export async function coordinatorOrdersReport(
  accessToken: string,
  opts?: {
    from?: string;
    to?: string;
    driverId?: string | null;
    cursor?: string | null;
    limit?: number;
  }
): Promise<CoordinatorOrdersReportPage> {
  const params = new URLSearchParams();
  params.set("t", String(Date.now()));
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  if (opts?.driverId) params.set("driverId", opts.driverId);
  if (opts?.cursor) params.set("cursor", opts.cursor);
  params.set("limit", String(opts?.limit ?? 20));

  const res = await coordinatorFetchWithRefresh(`/orders/reports?${params.toString()}`, { cache: "no-store" }, accessToken);
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message ?? "فشل تحميل التقرير");
  }
  const data = (await res.json()) as {
    orders?: CoordinatorOrderRow[];
    nextCursor?: string | null;
    summary?: Partial<CoordinatorOrdersReportSummary>;
  };

  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    nextCursor: data.nextCursor ?? null,
    summary: {
      orderCount: typeof data.summary?.orderCount === "number" ? data.summary.orderCount : 0,
      totalAmount: typeof data.summary?.totalAmount === "string" ? data.summary.totalAmount : "0.00",
      from: typeof data.summary?.from === "string" ? data.summary.from : "",
      to: typeof data.summary?.to === "string" ? data.summary.to : ""
    }
  };
}

export async function coordinatorCreateOrder(
  accessToken: string,
  body: {
    pickupAddress: string;
    dropoffAddress: string;
    amount: number;
    broadcastTarget: OrderBroadcastTarget;
    vehicleRequirement?: OrderVehicleRequirement;
    notes?: string;
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

export async function registerExpoPushToken(accessToken: string, expoToken: string): Promise<void> {
  const res = await coordinatorFetchWithRefresh(
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
  await coordinatorFetchWithRefresh("/auth/push-token", { method: "DELETE" }, accessToken);
}
