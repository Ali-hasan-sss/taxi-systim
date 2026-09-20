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
  const [versionsSaving, setVersionsSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const [commissionType, setCommissionType] = useState<CommissionType>("PERCENTAGE");
  const [commissionValue, setCommissionValue] = useState("0");

  const [driverMinVersion, setDriverMinVersion] = useState("0.0.0");
  const [driverAndroidUrl, setDriverAndroidUrl] = useState("");
  const [driverIosUrl, setDriverIosUrl] = useState("");
  const [coordinatorMinVersion, setCoordinatorMinVersion] = useState("0.0.0");
  const [coordinatorAndroidUrl, setCoordinatorAndroidUrl] = useState("");
  const [coordinatorIosUrl, setCoordinatorIosUrl] = useState("");

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
        const [setting, versions, me] = await Promise.all([
          api.getCommissionSettings(token),
          api.getAppVersionSettings(token),
          api.me(token)
        ]);
        if (setting) {
          setCommissionType(setting.commissionType);
          setCommissionValue(String(setting.commissionValue ?? "0"));
        }
        setDriverMinVersion(versions.driverMinVersion || "0.0.0");
        setDriverAndroidUrl(versions.driverAndroidUrl || "");
        setDriverIosUrl(versions.driverIosUrl || "");
        setCoordinatorMinVersion(versions.coordinatorMinVersion || "0.0.0");
        setCoordinatorAndroidUrl(versions.coordinatorAndroidUrl || "");
        setCoordinatorIosUrl(versions.coordinatorIosUrl || "");
        setAdminName(me.fullName);
        setAdminEmail(me.email ?? "");
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

  const submitProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const trimmedName = adminName.trim();
    if (trimmedName.length < 2) {
      setError("الاسم يجب أن يكون حرفين على الأقل.");
      return;
    }

    setProfileSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateAdminProfile(token, { fullName: trimmedName });
      setAdminName(updated.fullName);
      setNotice("تم تحديث اسم حساب الأدمن بنجاح.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل تحديث الاسم";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setProfileSaving(false);
    }
  };

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

  const submitAppVersions = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setVersionsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateAppVersionSettings(token, {
        driverMinVersion: driverMinVersion.trim() || "0.0.0",
        driverAndroidUrl: driverAndroidUrl.trim(),
        driverIosUrl: driverIosUrl.trim(),
        coordinatorMinVersion: coordinatorMinVersion.trim() || "0.0.0",
        coordinatorAndroidUrl: coordinatorAndroidUrl.trim(),
        coordinatorIosUrl: coordinatorIosUrl.trim()
      });
      setDriverMinVersion(updated.driverMinVersion);
      setDriverAndroidUrl(updated.driverAndroidUrl);
      setDriverIosUrl(updated.driverIosUrl);
      setCoordinatorMinVersion(updated.coordinatorMinVersion);
      setCoordinatorAndroidUrl(updated.coordinatorAndroidUrl);
      setCoordinatorIosUrl(updated.coordinatorIosUrl);
      setNotice("تم تحديث إعدادات نسخ التطبيقات. أي نسخة أقل من الحد الأدنى ستُوقف حتى التحديث.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل تحديث إعدادات النسخ";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setVersionsSaving(false);
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
          من هنا يمكن للأدمن تعديل اسم حسابه، إعدادات العمولة، الحد الأدنى لنسخ التطبيقات، وتغيير كلمة المرور بشكل آمن.
        </p>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="settings-notice">{notice}</p> : null}

      <section className="settings-grid">
        <article className="card settings-card">
          <h3 className="settings-card__title">حساب الأدمن</h3>
          <p className="settings-card__hint">يظهر هذا الاسم في لوحة التحكم وعند تسجيل الدخول.</p>

          <form className="settings-form" onSubmit={submitProfile}>
            <label className="settings-field">
              <span>البريد الإلكتروني</span>
              <input className="input-styled" type="email" value={adminEmail} disabled />
            </label>

            <label className="settings-field">
              <span>الاسم الكامل</span>
              <input
                className="input-styled"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="اسم الأدمن"
                required
                minLength={2}
              />
            </label>

            <div className="settings-actions">
              <button type="submit" className="btn btn-primary" disabled={profileSaving}>
                {profileSaving ? "جارٍ الحفظ..." : "حفظ الاسم"}
              </button>
            </div>
          </form>
        </article>

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

        <article className="card settings-card settings-card--wide">
          <h3 className="settings-card__title">إيقاف التطبيق عند عدم التحديث</h3>
          <p className="settings-card__hint">
            إذا كانت نسخة تطبيق السائق أو المنسق أقل من الرقم أدناه يُوقف التطبيق بالكامل حتى يحدّث. استخدم{" "}
            <strong>0.0.0</strong> لتعطيل الإيقاف الإجباري لتطبيق معيّن. ضع رابط متجر بلاي أو ملف التحميل حتى يعمل زر
            «تحديث الآن».
          </p>

          <form className="settings-form" onSubmit={submitAppVersions}>
            <div className="settings-versions-grid">
              <div className="settings-versions-col">
                <h4 className="settings-versions-col__title">تطبيق السائق</h4>
                <label className="settings-field">
                  <span>الحد الأدنى للنسخة</span>
                  <input
                    className="input-styled"
                    value={driverMinVersion}
                    onChange={(e) => setDriverMinVersion(e.target.value)}
                    placeholder="مثال: 1.0.11"
                    dir="ltr"
                  />
                </label>
                <label className="settings-field">
                  <span>رابط أندرويد</span>
                  <input
                    className="input-styled"
                    value={driverAndroidUrl}
                    onChange={(e) => setDriverAndroidUrl(e.target.value)}
                    placeholder="https://play.google.com/store/apps/details?id=..."
                    dir="ltr"
                  />
                </label>
                <label className="settings-field">
                  <span>رابط آيفون</span>
                  <input
                    className="input-styled"
                    value={driverIosUrl}
                    onChange={(e) => setDriverIosUrl(e.target.value)}
                    placeholder="https://apps.apple.com/..."
                    dir="ltr"
                  />
                </label>
              </div>

              <div className="settings-versions-col">
                <h4 className="settings-versions-col__title">تطبيق المنسق</h4>
                <label className="settings-field">
                  <span>الحد الأدنى للنسخة</span>
                  <input
                    className="input-styled"
                    value={coordinatorMinVersion}
                    onChange={(e) => setCoordinatorMinVersion(e.target.value)}
                    placeholder="مثال: 1.0.15"
                    dir="ltr"
                  />
                </label>
                <label className="settings-field">
                  <span>رابط أندرويد</span>
                  <input
                    className="input-styled"
                    value={coordinatorAndroidUrl}
                    onChange={(e) => setCoordinatorAndroidUrl(e.target.value)}
                    placeholder="https://play.google.com/store/apps/details?id=..."
                    dir="ltr"
                  />
                </label>
                <label className="settings-field">
                  <span>رابط آيفون</span>
                  <input
                    className="input-styled"
                    value={coordinatorIosUrl}
                    onChange={(e) => setCoordinatorIosUrl(e.target.value)}
                    placeholder="https://apps.apple.com/..."
                    dir="ltr"
                  />
                </label>
              </div>
            </div>

            <div className="settings-inline-note">
              النسخة الحالية في المشروع: السائق <strong>1.0.11</strong> — المنسق <strong>1.0.15</strong>. ارفع الحد الأدنى
              بعد نشر نسخة جديدة لإيقاف النسخ القديمة.
            </div>

            <div className="settings-actions">
              <button type="submit" className="btn btn-primary" disabled={versionsSaving}>
                {versionsSaving ? "جارٍ الحفظ..." : "حفظ إعدادات النسخ"}
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
