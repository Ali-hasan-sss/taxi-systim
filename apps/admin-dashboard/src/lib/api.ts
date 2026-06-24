const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const SESSION_KEY = "taxi_admin_session";

export interface AdminLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: "ADMIN" | "COORDINATOR" | "DRIVER";
  };
}

export type VehicleKind = "PUBLIC" | "PRIVATE" | "VIP";

export interface EmployeeDriverProfile {
  id?: string;
  vehicleBrand: string | null;
  vehicleKind: VehicleKind | null;
  vehicleColor: string | null;
  vehicleNumber: string | null;
}

export interface Employee {
  id: string;
  email: string | null;
  fullName: string;
  phone?: string | null;
  role: "ADMIN" | "COORDINATOR" | "DRIVER";
  isActive: boolean;
  createdAt: string;
  /** هل سجّل الجهاز رمز Expo Push (من قائمة الموظفين — بدون طلب إضافي) */
  hasPushToken?: boolean;
  driver?: EmployeeDriverProfile | null;
}

export interface EmployeeCoordinatorProfile {
  id: string;
}

export interface EmployeeDriverDetail extends EmployeeDriverProfile {
  id: string;
  isOnline?: boolean;
  isBusy?: boolean;
}

export interface EmployeeProfileStats {
  completedOrders: number;
  pendingOrders: number;
  inProgressOrders: number;
  dueCommissionAmount: string;
  totalPaidCommissions: string;
}

export interface EmployeeProfile extends Omit<Employee, "driver"> {
  driver: EmployeeDriverDetail | null;
  coordinator: EmployeeCoordinatorProfile | null;
  stats: EmployeeProfileStats;
}

export interface DriverCoordinatorOption {
  id: string;
  fullName: string;
  phone: string | null;
}

export type CommissionType = "PERCENTAGE" | "FIXED";

export interface CommissionSetting {
  id: string;
  key: string;
  commissionType: CommissionType;
  commissionValue: string | number;
  updatedAt?: string;
}

export type FinanceOrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "ARRIVED"
  | "EN_ROUTE_TO_CUSTOMER"
  | "STARTED"
  | "STUCK"
  | "COMPLETED"
  | "CANCELLED";

export type FinancePaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export interface FinanceOrderRow {
  id: string;
  customerName: string;
  customerPhone: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  amount: string;
  status: FinanceOrderStatus;
  createdAt: string;
  completedAt: string | null;
  driver: null | {
    id: string;
    fullName: string;
    phone: string | null;
  };
  coordinator: null | {
    id: string;
    fullName: string;
    phone: string | null;
  };
  commission: null | {
    id: string;
    calculatedCommission: string;
    paidAmount: string;
    remainingAmount: string;
    paymentStatus: FinancePaymentStatus;
    paidAt: string | null;
  };
}

export interface FinanceReportSummary {
  completedOrdersCount: number;
  completedOrdersAmount: string;
  totalCommissionAmount: string;
  dueCommissionAmount: string;
  compensationAmount: string;
  adjustedDueCommissionAmount: string;
  from: string;
  to: string;
}

export interface FinanceReportResponse {
  rows: FinanceOrderRow[];
  nextCursor: string | null;
  summary: FinanceReportSummary;
}

export interface FinanceExportFile {
  blob: Blob;
  filename: string;
}

export interface AdminDashboardStats {
  today: string;
  revenueToday: string;
  commissionToday: string;
  dueCommission: string;
  completedOrdersToday: number;
  activeTrips: number;
  activeDriversOnline: number;
  totalDrivers: number;
  employeesTotal: number;
  employeesByRole: {
    admin: number;
    coordinator: number;
    driver: number;
  };
}

export type AdminOrdersRoomSegment =
  | "pending"
  | "in_progress"
  | "stuck"
  | "needs_info"
  | "needs_invoice";

export interface AdminOrdersRoomFilterCounts {
  all: number;
  needs_info: number;
  needs_invoice: number;
  stuck: number;
  pending: number;
  in_progress: number;
}

export interface AdminOrderRoomRow {
  id: string;
  driverId?: string | null;
  customerName: string;
  customerPhone: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  amount: string;
  status: string;
  broadcastTarget: string;
  vehicleRequirement?: string;
  notes?: string | null;
  createdAt: string;
  coordinatorName: string;
  driver: null | {
    id: string;
    user: { fullName: string; phone: string | null };
    vehicleBrand?: string | null;
    vehicleColor?: string | null;
    vehicleNumber?: string | null;
    vehicleKind?: string | null;
  };
}

export type AdminOrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "ARRIVED"
  | "EN_ROUTE_TO_CUSTOMER"
  | "STARTED"
  | "STUCK"
  | "COMPLETED"
  | "CANCELLED";

export type AdminOrderStatusFilter = AdminOrderStatus | "ALL";

export interface AdminOrdersTableStats {
  all: number;
  byStatus: Record<AdminOrderStatus, number>;
}

export interface AdminOrdersTableResponse {
  orders: AdminOrderRoomRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type DriverLiveStatus = "online" | "busy" | "offline";

export type OrderBroadcastTarget = "ALL" | "NEAREST_THREE";

export type OrderVehicleRequirement = "ANY" | "PUBLIC" | "PRIVATE" | "VIP";

export interface LiveDriverSummary {
  totalDrivers: number;
  activeDrivers: number;
  driversOnMap: number;
}

export interface AdminLiveDriver {
  driverId: string;
  lat: number | null;
  lng: number | null;
  fullName: string;
  phone: string | null;
  isBusy: boolean;
  isOnline: boolean;
  status: DriverLiveStatus;
  vehicleBrand: string | null;
  vehicleKind: VehicleKind | null;
  vehicleColor: string | null;
  vehicleNumber: string | null;
}

export interface AdminLiveDriversResponse {
  drivers: AdminLiveDriver[];
  total: number;
  nextOffset: number | null;
  summary: LiveDriverSummary;
}

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: AdminLoginResponse["user"];
}

const authHeaders = (accessToken: string, init?: RequestInit) => {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (!(init?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

const getSession = (): StoredSession | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
};

const setSession = (session: StoredSession) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
};

const clearSession = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
  }
};

export function getSocketOrigin(): string {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return API_BASE.replace(/\/api\/?$/, "");
  }
}

const parseErrorMessage = async (res: Response, fallback: string) => {
  const body = (await res.json().catch(() => ({ message: fallback }))) as { message?: string };
  return body.message ?? fallback;
};

const parseDownloadFilename = (res: Response, fallback: string) => {
  const disposition = res.headers.get("content-disposition") ?? "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const basicMatch = disposition.match(/filename="?([^"]+)"?/i);
  return basicMatch?.[1] ?? fallback;
};

const refreshAccessToken = async () => {
  const session = getSession();
  if (!session?.refreshToken) return null;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken })
  });

  if (!res.ok) return null;
  const body = (await res.json()) as { accessToken: string };
  const next = { ...session, accessToken: body.accessToken };
  setSession(next);
  return body.accessToken;
};

const authorizedFetch = async (path: string, init: RequestInit, providedAccessToken?: string) => {
  let token = getSession()?.accessToken ?? providedAccessToken;
  if (!token) {
    clearSession();
    throw new Error("SESSION_EXPIRED");
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(token, init), ...(init.headers ?? {}) }
  });

  if (res.status !== 401) return res;

  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    clearSession();
    throw new Error("SESSION_EXPIRED");
  }

  token = refreshed;
  res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(token, init), ...(init.headers ?? {}) }
  });
  return res;
};

export const api = {
  async adminLogin(email: string, password: string): Promise<AdminLoginResponse> {
    const res = await fetch(`${API_BASE}/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res, "Login failed"));
    return res.json() as Promise<AdminLoginResponse>;
  },

  async me(accessToken: string) {
    const res = await authorizedFetch("/auth/admin/me", { method: "GET" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "Unauthorized"));
    return res.json() as Promise<{ id: string; email: string; fullName: string; role: "ADMIN" }>;
  },

  async updateAdminProfile(accessToken: string, payload: { fullName: string }) {
    const res = await authorizedFetch(
      "/auth/profile",
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل تحديث اسم الحساب"));
    const user = (await res.json()) as { id: string; email: string | null; fullName: string; role: "ADMIN" };
    const session = getSession();
    if (session) {
      setSession({
        ...session,
        user: {
          ...session.user,
          fullName: user.fullName,
          email: user.email ?? session.user.email
        }
      });
    }
    return user;
  },

  async getDashboardStats(accessToken: string) {
    const res = await authorizedFetch("/admin/dashboard-stats", { method: "GET", cache: "no-store" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تحميل الإحصائيات"));
    return res.json() as Promise<AdminDashboardStats>;
  },

  async listOrdersRoom(
    accessToken: string,
    segment?: AdminOrdersRoomSegment | null,
    opts?: { cursor?: string; limit?: number }
  ) {
    const params = new URLSearchParams({ t: String(Date.now()) });
    if (segment) params.set("segment", segment);
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const res = await authorizedFetch(`/admin/orders-room?${params.toString()}`, { method: "GET", cache: "no-store" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تحميل الطلبات"));
    const body = (await res.json()) as { orders?: AdminOrderRoomRow[]; nextCursor?: string | null };
    return {
      orders: Array.isArray(body.orders) ? body.orders : [],
      nextCursor: body.nextCursor ?? null
    };
  },

  async getOrdersRoomStats(accessToken: string) {
    const res = await authorizedFetch("/admin/orders-room/stats", { method: "GET", cache: "no-store" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تحميل إحصائيات الطلبات"));
    const body = (await res.json()) as { filterCounts?: AdminOrdersRoomFilterCounts };
    return body.filterCounts ?? {
      all: 0,
      needs_info: 0,
      needs_invoice: 0,
      stuck: 0,
      pending: 0,
      in_progress: 0
    };
  },

  async listAdminOrders(
    accessToken: string,
    params?: {
      status?: AdminOrderStatusFilter;
      q?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const query = new URLSearchParams({ t: String(Date.now()) });
    if (params?.status && params.status !== "ALL") query.set("status", params.status);
    if (params?.q?.trim()) query.set("q", params.q.trim());
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const res = await authorizedFetch(`/admin/orders?${query.toString()}`, { method: "GET", cache: "no-store" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تحميل الطلبات"));
    return res.json() as Promise<AdminOrdersTableResponse>;
  },

  async getAdminOrdersStats(accessToken: string) {
    const res = await authorizedFetch("/admin/orders/stats", { method: "GET", cache: "no-store" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تحميل إحصائيات الطلبات"));
    return res.json() as Promise<AdminOrdersTableStats>;
  },

  async updateAdminOrderAmount(accessToken: string, orderId: string, amount: number) {
    const res = await authorizedFetch(
      `/admin/orders/${encodeURIComponent(orderId)}/amount`,
      { method: "PATCH", body: JSON.stringify({ amount }) },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تعديل الأجرة"));
    return res.json() as Promise<AdminOrderRoomRow>;
  },

  async deleteAdminOrder(accessToken: string, orderId: string) {
    const res = await authorizedFetch(
      `/admin/orders/${encodeURIComponent(orderId)}`,
      { method: "DELETE" },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر حذف الطلب"));
    return res.json() as Promise<{ id: string }>;
  },

  async cancelAdminOrder(accessToken: string, orderId: string) {
    const res = await authorizedFetch(`/orders/${encodeURIComponent(orderId)}/cancel`, { method: "PATCH" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر إلغاء الطلب"));
    return res.json() as Promise<AdminOrderRoomRow>;
  },

  async resumeStuckAdminOrder(accessToken: string, orderId: string) {
    const res = await authorizedFetch(
      `/orders/${encodeURIComponent(orderId)}/resume-stuck`,
      { method: "PATCH" },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر إعادة الطلب للسائق"));
    return res.json() as Promise<AdminOrderRoomRow>;
  },

  async updateAdminOrderDetails(
    accessToken: string,
    orderId: string,
    payload: {
      customerName?: string;
      customerPhone?: string;
      pickupAddress?: string;
      dropoffAddress?: string;
      notes?: string;
    }
  ) {
    const res = await authorizedFetch(
      `/admin/orders/${encodeURIComponent(orderId)}/details`,
      { method: "PATCH", body: JSON.stringify(payload) },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تعديل تفاصيل الطلب"));
    return res.json() as Promise<AdminOrderRoomRow>;
  },

  async listEmployees(accessToken: string, params?: { role?: Employee["role"]; q?: string }) {
    const query = new URLSearchParams();
    if (params?.role) query.set("role", params.role);
    if (params?.q?.trim()) query.set("q", params.q.trim());
    const qs = query.toString();
    const res = await authorizedFetch(`/users${qs ? `?${qs}` : ""}`, { method: "GET" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل جلب الموظفين"));
    return res.json() as Promise<Employee[]>;
  },

  async downloadEmployeesExport(accessToken: string): Promise<FinanceExportFile> {
    const res = await authorizedFetch("/users/export.xlsx", { method: "GET" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل تصدير الموظفين"));
    return {
      blob: await res.blob(),
      filename: parseDownloadFilename(res, "employees-export.xlsx")
    };
  },

  async getEmployeeProfile(accessToken: string, userId: string) {
    const res = await authorizedFetch(`/users/${encodeURIComponent(userId)}/profile`, { method: "GET" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تحميل تفاصيل الموظف"));
    return res.json() as Promise<EmployeeProfile>;
  },

  async listDriverCoordinators(accessToken: string, userId: string) {
    const res = await authorizedFetch(`/users/${encodeURIComponent(userId)}/coordinators`, { method: "GET" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تحميل قائمة المنسقين"));
    return res.json() as Promise<DriverCoordinatorOption[]>;
  },

  async createEmployee(
    accessToken: string,
    payload: {
      email?: string;
      password: string;
      fullName: string;
      phone?: string;
      role: Employee["role"];
      driverProfile?: {
        vehicleBrand?: string | null;
        vehicleKind?: VehicleKind | null;
        vehicleColor?: string | null;
        plateNumber?: string | null;
      };
    }
  ) {
    const res = await authorizedFetch(
      "/users",
      {
      method: "POST",
      body: JSON.stringify(payload)
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل إضافة الموظف"));
    return res.json() as Promise<Employee>;
  },

  async bulkCreateDrivers(
    accessToken: string,
    drivers: {
      fullName: string;
      phone: string;
      password: string;
      vehicleBrand?: string | null;
      vehicleKind?: VehicleKind | null;
      vehicleColor?: string | null;
      plateNumber?: string | null;
    }[]
  ) {
    const res = await authorizedFetch(
      "/users/bulk-drivers",
      {
        method: "POST",
        body: JSON.stringify({ drivers })
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل استيراد السائقين"));
    return res.json() as Promise<{
      createdCount: number;
      failed: { row: number; fullName: string; reason: string }[];
      created: { id: string; fullName: string; phone: string | null }[];
    }>;
  },

  async updateEmployee(
    accessToken: string,
    userId: string,
    payload: {
      email?: string;
      password?: string;
      fullName?: string;
      phone?: string;
      role?: Employee["role"];
      driverProfile?: {
        vehicleBrand?: string | null;
        vehicleKind?: VehicleKind | null;
        vehicleColor?: string | null;
        plateNumber?: string | null;
      };
    }
  ) {
    const res = await authorizedFetch(
      `/users/${userId}`,
      {
      method: "PATCH",
      body: JSON.stringify(payload)
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل تعديل بيانات الموظف"));
    return res.json() as Promise<Employee>;
  },

  async toggleEmployeeStatus(accessToken: string, userId: string, isActive: boolean) {
    const res = await authorizedFetch(
      `/users/${userId}/status`,
      {
      method: "PATCH",
      body: JSON.stringify({ isActive })
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل تغيير حالة الموظف"));
    return res.json() as Promise<Employee>;
  },

  async deleteEmployee(accessToken: string, userId: string) {
    const res = await authorizedFetch(`/users/${userId}`, { method: "DELETE" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل حذف الموظف"));
    return res.json() as Promise<{ message: string }>;
  },

  async getCommissionSettings(accessToken: string) {
    const res = await authorizedFetch("/settings/commission", { method: "GET" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل جلب إعدادات العمولة"));
    return res.json() as Promise<CommissionSetting | null>;
  },

  async updateCommissionSettings(
    accessToken: string,
    payload: { commissionType: CommissionType; commissionValue: number }
  ) {
    const res = await authorizedFetch(
      "/settings/commission",
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل تحديث إعدادات العمولة"));
    return res.json() as Promise<CommissionSetting>;
  },

  async changePassword(
    accessToken: string,
    payload: { currentPassword: string; newPassword: string }
  ) {
    const res = await authorizedFetch(
      "/auth/change-password",
      {
        method: "POST",
        body: JSON.stringify(payload)
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل تغيير كلمة المرور"));
  },

  async financeReport(
    accessToken: string,
    opts?: {
      from?: string;
      to?: string;
      driverId?: string | null;
      coordinatorId?: string | null;
      cursor?: string | null;
      limit?: number;
    }
  ) {
    const params = new URLSearchParams();
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    if (opts?.driverId) params.set("driverId", opts.driverId);
    if (opts?.coordinatorId) params.set("coordinatorId", opts.coordinatorId);
    if (opts?.cursor) params.set("cursor", opts.cursor);
    params.set("limit", String(opts?.limit ?? 25));

    const res = await authorizedFetch(`/accounting/report?${params.toString()}`, { method: "GET" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل تحميل التقرير المالي"));
    return res.json() as Promise<FinanceReportResponse>;
  },

  async recordDriverCompensation(
    accessToken: string,
    payload: { driverId: string; amount: number; notes?: string }
  ) {
    const res = await authorizedFetch(
      "/accounting/compensations",
      {
        method: "POST",
        body: JSON.stringify(payload)
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل تسجيل التعويض"));
    return res.json() as Promise<{ message: string; driverId: string; amount: number }>;
  },

  async downloadFinanceExport(
    accessToken: string,
    opts?: {
      from?: string;
      to?: string;
      driverId?: string | null;
      coordinatorId?: string | null;
    }
  ): Promise<FinanceExportFile> {
    const params = new URLSearchParams();
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    if (opts?.driverId) params.set("driverId", opts.driverId);
    if (opts?.coordinatorId) params.set("coordinatorId", opts.coordinatorId);

    const query = params.toString();
    const path = query ? `/accounting/report/export.xlsx?${query}` : "/accounting/report/export.xlsx";
    const res = await authorizedFetch(path, { method: "GET" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل تصدير التقرير"));

    return {
      blob: await res.blob(),
      filename: parseDownloadFilename(res, "finance-report.xlsx")
    };
  },

  async liveDrivers(
    accessToken: string,
    opts?: {
      q?: string;
      limit?: number;
      offset?: number;
      includeInactive?: boolean;
    }
  ) {
    const params = new URLSearchParams({ t: String(Date.now()) });
    if (opts?.q?.trim()) params.set("q", opts.q.trim());
    if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
    if (typeof opts?.offset === "number") params.set("offset", String(opts.offset));
    if (opts?.includeInactive) params.set("includeInactive", "true");

    const res = await authorizedFetch(`/drivers/live?${params.toString()}`, { method: "GET", cache: "no-store" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل تحميل مواقع السائقين"));
    const data = (await res.json()) as Partial<AdminLiveDriversResponse>;
    return {
      drivers: Array.isArray(data.drivers) ? data.drivers : [],
      total: typeof data.total === "number" ? data.total : 0,
      nextOffset: typeof data.nextOffset === "number" ? data.nextOffset : null,
      summary: {
        totalDrivers: typeof data.summary?.totalDrivers === "number" ? data.summary.totalDrivers : 0,
        activeDrivers: typeof data.summary?.activeDrivers === "number" ? data.summary.activeDrivers : 0,
        driversOnMap: typeof data.summary?.driversOnMap === "number" ? data.summary.driversOnMap : 0
      }
    } satisfies AdminLiveDriversResponse;
  },

  async createOrder(
    accessToken: string,
    payload: {
      customerName?: string;
      customerPhone?: string;
      pickupAddress: string;
      dropoffAddress: string;
      amount: number;
      notes?: string;
      broadcastTarget?: OrderBroadcastTarget;
      vehicleRequirement?: OrderVehicleRequirement;
    }
  ) {
    const res = await authorizedFetch(
      "/orders",
      {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          broadcastTarget: payload.broadcastTarget ?? "ALL",
          vehicleRequirement: payload.vehicleRequirement ?? "ANY"
        })
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل إنشاء الطلب"));
    return res.json() as Promise<{ id: string }>;
  },

  async assignOrder(accessToken: string, orderId: string, driverId: string) {
    const res = await authorizedFetch(
      `/orders/${encodeURIComponent(orderId)}/assign`,
      {
        method: "PATCH",
        body: JSON.stringify({ driverId })
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل إسناد الطلب"));
    return res.json() as Promise<{ id: string }>;
  },

  async settleOrderCommission(accessToken: string, payload: { orderId: string; notes?: string }) {
    const res = await authorizedFetch(
      "/accounting/payments/settle-order",
      {
        method: "POST",
        body: JSON.stringify(payload)
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل تسديد عمولة الطلب"));
    return res.json() as Promise<{ message: string; paidCount: number; totalPaid: number }>;
  },

  async settleFilteredCommissions(
    accessToken: string,
    payload: { from?: string; to?: string; driverId?: string | null; coordinatorId?: string | null; notes?: string }
  ) {
    const res = await authorizedFetch(
      "/accounting/payments/settle-filtered",
      {
        method: "POST",
        body: JSON.stringify(payload)
      },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل التسديد الجماعي"));
    return res.json() as Promise<{ message: string; paidCount: number; totalPaid: number }>;
  },

  clearSession() {
    clearSession();
  },

  async listChatRooms(accessToken: string, scope: "active" | "archived" = "active", q?: string) {
    const params = new URLSearchParams();
    if (scope === "archived") params.set("scope", "archived");
    if (q?.trim()) params.set("q", q.trim());
    const qs = params.toString();
    const res = await authorizedFetch(`/chat/rooms${qs ? `?${qs}` : ""}`, {}, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تحميل المحادثات"));
    const body = (await res.json()) as { rooms: ChatRoomRow[] };
    return body.rooms;
  },

  async listChatMessages(accessToken: string, roomId: string, cursor?: string) {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const res = await authorizedFetch(`/chat/rooms/${roomId}/messages${qs}`, {}, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تحميل الرسائل"));
    return res.json() as Promise<{ messages: ChatMessageRow[]; nextCursor: string | null }>;
  },

  async sendChatMessage(accessToken: string, roomId: string, body: string) {
    const res = await authorizedFetch(
      `/chat/rooms/${roomId}/messages`,
      { method: "POST", body: JSON.stringify({ body }) },
      accessToken
    );
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر إرسال الرسالة"));
    return res.json() as Promise<ChatMessageRow>;
  },

  async uploadChatImage(accessToken: string, roomId: string, file: File, caption?: string) {
    const form = new FormData();
    form.append("image", file);
    if (caption?.trim()) form.append("caption", caption.trim());
    const res = await authorizedFetch(`/chat/rooms/${roomId}/images`, { method: "POST", body: form }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر رفع الصورة"));
    return res.json() as Promise<ChatMessageRow>;
  },

  async markChatRoomRead(accessToken: string, roomId: string) {
    const res = await authorizedFetch(`/chat/rooms/${roomId}/read`, { method: "POST" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "تعذر تحديث حالة القراءة"));
  },

  async fetchChatImageObjectUrl(accessToken: string, imageUrl: string): Promise<string | null> {
    const rawName = imageUrl.split("?")[0].split("/").pop();
    if (!rawName) return null;
    const filename = decodeURIComponent(rawName);
    const res = await authorizedFetch(`/chat/images/${encodeURIComponent(filename)}`, {}, accessToken);
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }
};

export type ChatMessageRow = {
  id: string;
  roomId: string;
  body: string | null;
  imageUrl: string | null;
  imageExpired: boolean;
  sender: { id: string; fullName: string; role: string };
  createdAt: string;
  receiptStatus?: "sent" | "delivered" | "read";
};

export type ChatRoomRow = {
  id: string;
  type: "GLOBAL" | "ORDER";
  title: string;
  orderId: string | null;
  peerName: string | null;
  peerUserId: string | null;
  peerDriverId: string | null;
  peerOnline: boolean | null;
  orderLabel: string | null;
  coordinatorName?: string | null;
  driverName?: string | null;
  pickupAddress?: string | null;
  archivedAt: string | null;
  lastMessage: ChatMessageRow | null;
  updatedAt: string;
};
