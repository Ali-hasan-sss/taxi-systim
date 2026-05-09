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

export interface Employee {
  id: string;
  email: string | null;
  fullName: string;
  phone?: string | null;
  role: "ADMIN" | "COORDINATOR" | "DRIVER";
  isActive: boolean;
  createdAt: string;
}

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: AdminLoginResponse["user"];
}

const authHeaders = (accessToken: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${accessToken}`
});

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

const parseErrorMessage = async (res: Response, fallback: string) => {
  const body = (await res.json().catch(() => ({ message: fallback }))) as { message?: string };
  return body.message ?? fallback;
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
    headers: { ...authHeaders(token), ...(init.headers ?? {}) }
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
    headers: { ...authHeaders(token), ...(init.headers ?? {}) }
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

  async listEmployees(accessToken: string, params?: { role?: Employee["role"] }) {
    const query = params?.role ? `?role=${params.role}` : "";
    const res = await authorizedFetch(`/users${query}`, { method: "GET" }, accessToken);
    if (!res.ok) throw new Error(await parseErrorMessage(res, "فشل جلب الموظفين"));
    return res.json() as Promise<Employee[]>;
  },

  async createEmployee(
    accessToken: string,
    payload: {
      email?: string;
      password: string;
      fullName: string;
      phone?: string;
      role: Employee["role"];
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

  async updateEmployee(
    accessToken: string,
    userId: string,
    payload: { email?: string; password?: string; fullName?: string; phone?: string; role?: Employee["role"] }
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
  }
};
