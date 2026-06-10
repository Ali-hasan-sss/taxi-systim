"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth.store";
import { DashboardBrandLogo } from "./dashboard-brand-logo";

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
    <form onSubmit={onSubmit} className="card login-card">
      <div className="login-card__brand">
        <div className="login-card__logo">
          <DashboardBrandLogo priority />
        </div>
        <div>
          <h2 className="login-card__title">Taxi Bro</h2>
          <p className="login-card__subtitle">لوحة إدارة شركة التكسي</p>
        </div>
      </div>

      <div className="login-field">
        <label htmlFor="admin-email">البريد الإلكتروني</label>
        <input
          id="admin-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="username"
        />
      </div>

      <div className="login-field">
        <label htmlFor="admin-password">كلمة المرور</label>
        <input
          id="admin-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      {error ? <p className="login-error">{error}</p> : null}

      <button className="btn btn-primary login-submit" type="submit" disabled={loading}>
        {loading ? "جاري تسجيل الدخول..." : "دخول"}
      </button>
    </form>
  );
};
