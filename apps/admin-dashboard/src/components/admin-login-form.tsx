"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth.store";

export const AdminLoginForm = () => {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("admin@taxi.local");
  const [password, setPassword] = useState("secret123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.adminLogin(email, password);
      if (result.user.role !== "ADMIN") {
        throw new Error("يجب أن تكون صلاحية المستخدم أدمن");
      }
      setSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          fullName: result.user.fullName,
          role: "ADMIN"
        }
      });
      localStorage.setItem("taxi_admin_session", JSON.stringify(result));
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card" style={{ padding: 24, width: "100%", maxWidth: 420 }}>
      <h2 style={{ marginTop: 0, marginBottom: 8 }}>تسجيل دخول الأدمن</h2>
      <p style={{ marginTop: 0, marginBottom: 20, color: "#6b7280" }}>لوحة إدارة شركة التكسي</p>

      <label style={{ display: "block", marginBottom: 6, fontSize: 14 }}>البريد الإلكتروني</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        required
        style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 10, border: "1px solid #d1d5db" }}
      />

      <label style={{ display: "block", marginBottom: 6, fontSize: 14 }}>كلمة المرور</label>
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        required
        style={{ width: "100%", padding: 10, marginBottom: 16, borderRadius: 10, border: "1px solid #d1d5db" }}
      />

      {error ? <p style={{ color: "#dc2626", marginTop: 0 }}>{error}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%" }}>
        {loading ? "جاري تسجيل الدخول..." : "دخول"}
      </button>
    </form>
  );
};
