"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, type BrandingSettings, type BrandingSlot } from "../lib/api";
import { notifyPlatformBrandingChanged } from "./dashboard-brand-logo";

const SLOTS: { slot: BrandingSlot; title: string; hint: string; cover: boolean; maxMb: number }[] = [
  {
    slot: "logo",
    title: "لوجو المنصة",
    hint: "يظهر في لوحة التحكم وتطبيق السائق وتطبيق المنسق.",
    cover: false,
    maxMb: 2
  },
  {
    slot: "coordinator-background",
    title: "خلفية تطبيق المنسق",
    hint: "تُعرض خلف شاشات تطبيق المنسق.",
    cover: true,
    maxMb: 6
  },
  {
    slot: "driver-background",
    title: "خلفية تطبيق السائق",
    hint: "تُعرض خلف شاشات تطبيق السائق.",
    cover: true,
    maxMb: 6
  }
];

function assetOf(branding: BrandingSettings, slot: BrandingSlot) {
  if (slot === "logo") return branding.logo;
  if (slot === "coordinator-background") return branding.coordinatorBackground;
  return branding.driverBackground;
}

export function BrandingSettingsCard({
  token,
  branding,
  onChange,
  onNotice,
  onError,
  onSessionExpired
}: {
  token: string;
  branding: BrandingSettings;
  onChange: (next: BrandingSettings) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onSessionExpired: () => void;
}) {
  const [files, setFiles] = useState<Partial<Record<BrandingSlot, File>>>({});
  const [inputKeys, setInputKeys] = useState<Partial<Record<BrandingSlot, number>>>({});
  const [saving, setSaving] = useState<BrandingSlot | null>(null);
  const [appName, setAppName] = useState(branding.appName);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    setAppName(branding.appName);
  }, [branding.appName]);

  const submit = async (event: FormEvent, slot: BrandingSlot) => {
    event.preventDefault();
    const file = files[slot];
    const meta = SLOTS.find((item) => item.slot === slot);
    if (!file || !meta) {
      onError("اختر صورة أولاً.");
      return;
    }
    const allowedType = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const allowedName = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!allowedType && !allowedName) {
      onError("الملف يجب أن يكون صورة JPG أو PNG أو WEBP.");
      return;
    }
    if (file.size > meta.maxMb * 1024 * 1024) {
      onError(`حجم الصورة يجب ألا يتجاوز ${meta.maxMb} ميغابايت.`);
      return;
    }

    setSaving(slot);
    onError("");
    try {
      const updated = await api.uploadBrandingImage(token, slot, file);
      onChange(updated);
      setFiles((current) => ({ ...current, [slot]: undefined }));
      setInputKeys((current) => ({ ...current, [slot]: (current[slot] ?? 0) + 1 }));
      if (slot === "logo") notifyPlatformBrandingChanged();
      onNotice("تم حفظ الصورة الجديدة وحذف السابقة من الخادم. التطبيقات تجلبها وتحفظها محليًا عند الفتح التالي.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل رفع الصورة";
      if (message === "SESSION_EXPIRED") {
        onSessionExpired();
        return;
      }
      onError(message);
    } finally {
      setSaving(null);
    }
  };

  const submitName = async (event: FormEvent) => {
    event.preventDefault();
    setSavingName(true);
    onError("");
    try {
      const updated = await api.updateBrandingAppName(token, appName);
      setAppName(updated.appName);
      onChange(updated);
      notifyPlatformBrandingChanged();
      onNotice("تم حفظ اسم التطبيق. يظهر في لوحة التحكم وتطبيق السائق وتطبيق المنسق مع اللوجو.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل حفظ اسم التطبيق";
      if (message === "SESSION_EXPIRED") {
        onSessionExpired();
        return;
      }
      onError(message);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <article className="card settings-card settings-card--wide">
      <h3 className="settings-card__title">اسم التطبيق واللوجو وخلفيات التطبيقات</h3>
      <p className="settings-card__hint">
        اسم التطبيق واللوجو يُجلبان معًا ويظهران في أعلى لوحة التحكم وتطبيق السائق وتطبيق المنسق. ارفع اللوجو وصورة خلفية
        لكل تطبيق. عند رفع صورة جديدة تُحذف القديمة من الخادم. التطبيقات تحفظ الهوية على الجهاز، وعند تغيّرها تجلب الجديدة.
      </p>

      <form className="settings-form" onSubmit={(event) => void submitName(event)}>
        <label className="settings-field">
          <span>اسم التطبيق (يظهر في الأعلى بجانب اللوجو)</span>
          <input
            className="input-styled"
            value={appName}
            onChange={(event) => setAppName(event.target.value)}
            maxLength={48}
            placeholder="مثال: Taxi Bro"
            autoComplete="off"
          />
        </label>
        <div className="settings-actions">
          <button type="submit" className="btn btn-primary" disabled={savingName || saving !== null}>
            {savingName ? "جارٍ الحفظ..." : "حفظ الاسم"}
          </button>
        </div>
      </form>

      <div className="settings-branding-grid">
        {SLOTS.map((item) => {
          const asset = assetOf(branding, item.slot);
          const selected = files[item.slot];
          return (
            <form key={item.slot} className="settings-branding-slot" onSubmit={(event) => void submit(event, item.slot)}>
              <h4 className="settings-versions-col__title">{item.title}</h4>
              <p className="settings-card__hint">{item.hint}</p>
              {asset.url ? (
                <img
                  src={`${asset.url}?v=${encodeURIComponent(asset.version ?? "")}`}
                  alt={item.title}
                  className={item.cover ? "settings-branding-preview settings-branding-preview--cover" : "settings-branding-preview"}
                />
              ) : (
                <div className="settings-branding-empty">تُستخدم الصورة الافتراضية داخل التطبيق إلى أن ترفع صورة.</div>
              )}
              <label className="settings-field">
                <span>صورة جديدة (JPG أو PNG أو WEBP، حتى {item.maxMb} ميغابايت)</span>
                <input
                  key={inputKeys[item.slot] ?? 0}
                  className="input-styled"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    setFiles((current) => ({ ...current, [item.slot]: file }));
                  }}
                />
              </label>
              <div className="settings-actions">
                <button type="submit" className="btn btn-primary" disabled={saving !== null || !selected}>
                  {saving === item.slot ? "جارٍ الرفع..." : asset.url ? "استبدال الصورة" : "رفع الصورة"}
                </button>
              </div>
            </form>
          );
        })}
      </div>
    </article>
  );
}
