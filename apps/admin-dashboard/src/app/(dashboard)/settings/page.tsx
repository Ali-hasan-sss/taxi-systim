"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type CommissionType } from "../../../lib/api";

const commissionTypeLabels: Record<CommissionType, string> = {
  PERCENTAGE: "نسبة مئوية",
  FIXED: "مبلغ ثابت لكل طلب"
};

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commissionSaving, setCommissionSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [commissionType, setCommissionType] = useState<CommissionType>("PERCENTAGE");
  const [commissionValue, setCommissionValue] = useState("0");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const token = useMemo(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("taxi_admin_session") : null;
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { accessToken: string }).accessToken;
    } catch {
      return null;
    }
  }, []);

  const handleSessionExpired = () => {
    api.clearSession();
    router.replace("/login");
  };

  useEffect(() => {
    const load = async () => {
      if (!token) {
        router.replace("/login");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const setting = await api.getCommissionSettings(token);
        if (setting) {
          setCommissionType(setting.commissionType);
          setCommissionValue(String(setting.commissionValue ?? "0"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "تعذر تحميل الإعدادات";
        if (message === "SESSION_EXPIRED") {
          handleSessionExpired();
          return;
        }
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router, token]);

  const submitCommission = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const parsedValue = Number(commissionValue.trim().replace(",", "."));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      setError("قيمة العمولة يجب أن تكون رقمًا صالحًا غير سالب.");
      return;
    }

    setCommissionSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateCommissionSettings(token, {
        commissionType,
        commissionValue: parsedValue
      });
      setCommissionType(updated.commissionType);
      setCommissionValue(String(updated.commissionValue ?? parsedValue));
      setNotice("تم تحديث إعدادات العمولة بنجاح.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل تحديث العمولة";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setCommissionSaving(false);
    }
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (newPassword.length < 6) {
      setError("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("تأكيد كلمة المرور غير مطابق.");
      return;
    }

    setPasswordSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.changePassword(token, { currentPassword, newPassword });
      api.clearSession();
      window.alert("تم تغيير كلمة المرور بنجاح. سجّل الدخول مجددًا.");
      router.replace("/login");
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل تغيير كلمة المرور";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-page-loading">
        <span className="spinner-inline" aria-hidden />
        جاري تحميل الإعدادات...
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <section className="card settings-hero">
        <h2 className="settings-hero__title">إعدادات النظام</h2>
        <p className="settings-hero__text">
          من هنا يمكن للأدمن تعديل نوع العمولة وقيمتها، وتغيير كلمة مرور حسابه الحالي بشكل آمن.
        </p>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="settings-notice">{notice}</p> : null}

      <section className="settings-grid">
        <article className="card settings-card">
          <h3 className="settings-card__title">إعدادات العمولة</h3>
          <p className="settings-card__hint">
            تُستخدم هذه الإعدادات في حساب عمولة السائق عند إكمال الطلب، سواء كانت نسبة مئوية أو مبلغًا ثابتًا.
          </p>

          <form className="settings-form" onSubmit={submitCommission}>
            <label className="settings-field">
              <span>نوع العمولة</span>
              <div className="select-wrap">
                <select
                  className="select-styled"
                  value={commissionType}
                  onChange={(e) => setCommissionType(e.target.value as CommissionType)}
                >
                  <option value="PERCENTAGE">{commissionTypeLabels.PERCENTAGE}</option>
                  <option value="FIXED">{commissionTypeLabels.FIXED}</option>
                </select>
                <span className="select-wrap__chevron">▼</span>
              </div>
            </label>

            <label className="settings-field">
              <span>{commissionType === "PERCENTAGE" ? "قيمة النسبة" : "قيمة المبلغ الثابت"}</span>
              <input
                className="input-styled"
                type="number"
                min="0"
                step="0.01"
                value={commissionValue}
                onChange={(e) => setCommissionValue(e.target.value)}
                placeholder={commissionType === "PERCENTAGE" ? "مثال: 10" : "مثال: 5000"}
              />
            </label>

            <div className="settings-inline-note">
              الوضع الحالي: <strong>{commissionTypeLabels[commissionType]}</strong>
            </div>

            <div className="settings-actions">
              <button type="submit" className="btn btn-primary" disabled={commissionSaving}>
                {commissionSaving ? "جارٍ الحفظ..." : "حفظ العمولة"}
              </button>
            </div>
          </form>
        </article>

        <article className="card settings-card">
          <h3 className="settings-card__title">تغيير كلمة المرور</h3>
          <p className="settings-card__hint">
            بعد تغيير كلمة المرور سيتم إنهاء الجلسة الحالية، وستحتاج إلى تسجيل الدخول مجددًا بكلمة المرور الجديدة.
          </p>

          <form className="settings-form" onSubmit={submitPassword}>
            <label className="settings-field">
              <span>كلمة المرور الحالية</span>
              <input
                className="input-styled"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الحالية"
                autoComplete="current-password"
              />
            </label>

            <label className="settings-field">
              <span>كلمة المرور الجديدة</span>
              <input
                className="input-styled"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
                autoComplete="new-password"
              />
            </label>

            <label className="settings-field">
              <span>تأكيد كلمة المرور الجديدة</span>
              <input
                className="input-styled"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد إدخال كلمة المرور الجديدة"
                autoComplete="new-password"
              />
            </label>

            <div className="settings-actions">
              <button type="submit" className="btn btn-primary" disabled={passwordSaving}>
                {passwordSaving ? "جارٍ التحديث..." : "تغيير كلمة المرور"}
              </button>
            </div>
          </form>
        </article>
      </section>
    </div>
  );
}
