"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type CreatePromotionPayload,
  type PromotionChannel,
  type PromotionRewardType,
  type PromotionRow
} from "../../../lib/api";

const channelLabel: Record<PromotionChannel, string> = {
  WEB_LINK: "رابط الويب",
  LOYALTY: "ولاء (عدد الطلبات)"
};

const rewardLabel: Record<PromotionRewardType, string> = {
  FIXED_DISCOUNT: "خصم مالي",
  FREE_ORDER: "طلب مجاني"
};

function emptyForm(): CreatePromotionPayload & { discountAmountText: string } {
  return {
    title: "",
    description: "",
    channel: "LOYALTY",
    rewardType: "FREE_ORDER",
    ordersThreshold: 5,
    discountAmountText: "",
    code: "",
    isActive: true
  };
}

export default function PromotionsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<PromotionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const handleSessionExpired = useCallback(() => {
    localStorage.removeItem("taxi_admin_session");
    router.replace("/login");
  }, [router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPromotions(token);
      setRows(res.promotions);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل العروض";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [handleSessionExpired, token]);

  useEffect(() => {
    const raw = localStorage.getItem("taxi_admin_session");
    if (!raw) {
      router.replace("/login");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { accessToken: string };
      setToken(parsed.accessToken);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowModal(true);
    setError(null);
  };

  const openEdit = (row: PromotionRow) => {
    setEditingId(row.id);
    setForm({
      title: row.title,
      description: row.description ?? "",
      channel: row.channel,
      rewardType: row.rewardType,
      ordersThreshold: row.ordersThreshold,
      discountAmountText: row.discountAmount ?? "",
      code: row.code ?? "",
      isActive: row.isActive
    });
    setShowModal(true);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const discountAmount =
      form.rewardType === "FIXED_DISCOUNT" ? Number(String(form.discountAmountText).replace(",", ".")) : undefined;
    if (form.rewardType === "FIXED_DISCOUNT" && (!Number.isFinite(discountAmount) || (discountAmount ?? 0) <= 0)) {
      setError("أدخل مبلغ خصم صالح.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const payload: CreatePromotionPayload = {
      title: form.title.trim(),
      description: form.description?.trim() || undefined,
      channel: form.channel,
      rewardType: form.rewardType,
      ordersThreshold: Number(form.ordersThreshold),
      discountAmount,
      code: form.channel === "WEB_LINK" ? form.code?.trim() : undefined,
      isActive: form.isActive
    };
    try {
      if (editingId) {
        await api.updatePromotion(token, editingId, payload);
        setNotice("تم تحديث العرض.");
      } else {
        await api.createPromotion(token, payload);
        setNotice("تم إنشاء العرض.");
      }
      setShowModal(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر حفظ العرض";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: PromotionRow) => {
    if (!token) return;
    try {
      await api.updatePromotion(token, row.id, { isActive: !row.isActive });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر التحديث";
      if (message === "SESSION_EXPIRED") handleSessionExpired();
      else setError(message);
    }
  };

  const remove = async (row: PromotionRow) => {
    if (!token) return;
    if (!window.confirm(`حذف العرض «${row.title}»؟`)) return;
    try {
      await api.deletePromotion(token, row.id);
      setNotice("تم حذف العرض.");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر الحذف";
      if (message === "SESSION_EXPIRED") handleSessionExpired();
      else setError(message);
    }
  };

  const copyLink = async (path: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(`تم نسخ الرابط: ${url}`);
    } catch {
      setNotice(url);
    }
  };

  return (
    <div className="dashboard-page">
      <section className="card employees-toolbar">
        <div className="employees-toolbar__row" style={{ justifyContent: "space-between" }}>
          <p className="orders-room-toolbar__hint" style={{ margin: 0 }}>
            عند تطبيق خصم على الزبون يُسجَّل تلقائيًا تعويض للسائق بنفس القيمة (سبب: عرض من المدير).
          </p>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            إضافة عرض
          </button>
        </div>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="settings-notice">{notice}</p> : null}

      <section className="card employees-table-card">
        {loading ? (
          <p className="loading-row">
            <span className="spinner" aria-hidden />
            جاري تحميل العروض...
          </p>
        ) : rows.length === 0 ? (
          <p className="orders-room-empty">لا توجد عروض بعد.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>العنوان</th>
                  <th>الآلية</th>
                  <th>المكافأة</th>
                  <th>كل كم طلب</th>
                  <th>الرمز / الرابط</th>
                  <th>الاستخدامات</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.title}</strong>
                      {row.description ? <div style={{ color: "var(--brand-text-muted)", fontSize: 12 }}>{row.description}</div> : null}
                    </td>
                    <td>{channelLabel[row.channel]}</td>
                    <td>
                      {rewardLabel[row.rewardType]}
                      {row.rewardType === "FIXED_DISCOUNT" && row.discountAmount ? ` · ${row.discountAmount}` : ""}
                    </td>
                    <td>{row.ordersThreshold}</td>
                    <td>
                      {row.code ? <code>{row.code}</code> : "—"}
                      {row.webBookPath ? (
                        <div>
                          <button type="button" className="btn btn-ghost" onClick={() => void copyLink(row.webBookPath!)}>
                            نسخ رابط الويب
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td>{row.redemptionsCount}</td>
                    <td>{row.isActive ? "نشط" : "موقوف"}</td>
                    <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" className="btn btn-ghost" onClick={() => openEdit(row)}>
                        تعديل
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => void toggleActive(row)}>
                        {row.isActive ? "إيقاف" : "تفعيل"}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => void remove(row)}>
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showModal ? (
        <div className="finance-export-modal" role="dialog" aria-modal="true" aria-labelledby="promo-modal-title">
          <button
            type="button"
            className="finance-export-modal__backdrop"
            onClick={() => !saving && setShowModal(false)}
            aria-label="إغلاق"
          />
          <div className="card finance-export-modal__card promo-modal__card">
            <div className="finance-export-modal__header">
              <div>
                <h3 id="promo-modal-title" className="finance-export-modal__title">
                  {editingId ? "تعديل عرض" : "إضافة عرض"}
                </h3>
                <p className="finance-export-modal__hint">
                  حدّد آلية العرض والمكافأة. عند تطبيق الخصم يُعوَّض السائق تلقائيًا بنفس القيمة.
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)} disabled={saving}>
                إغلاق
              </button>
            </div>

            <form onSubmit={(e) => void submit(e)} className="promo-modal__form">
              <div className="promo-modal__body">
              {error ? <p className="form-error">{error}</p> : null}
              <div className="finance-export-modal__grid">
                <label className="finance-export-modal__field finance-export-modal__field--full">
                  <span>عنوان العرض</span>
                  <input
                    className="input-styled"
                    required
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="مثال: كل 5 طلبات مجانًا"
                  />
                </label>

                <label className="finance-export-modal__field finance-export-modal__field--full">
                  <span>الوصف (اختياري)</span>
                  <textarea
                    className="input-styled promo-modal__textarea"
                    rows={2}
                    value={form.description ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="تفاصيل مختصرة تظهر للمدير فقط"
                  />
                </label>

                <div className="finance-export-modal__field finance-export-modal__field--full">
                  <span>آلية العرض</span>
                  <div className="promo-choice-grid">
                    <button
                      type="button"
                      className={`promo-choice${form.channel === "LOYALTY" ? " promo-choice--active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, channel: "LOYALTY" }))}
                    >
                      <strong>ولاء</strong>
                      <small>يُفعَّل عند بلوغ عدد طلبات الزبون للعتبة</small>
                    </button>
                    <button
                      type="button"
                      className={`promo-choice${form.channel === "WEB_LINK" ? " promo-choice--active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, channel: "WEB_LINK" }))}
                    >
                      <strong>رابط الويب</strong>
                      <small>عبر صفحة الحجز مع ?promo=رمز</small>
                    </button>
                  </div>
                </div>

                {form.channel === "WEB_LINK" ? (
                  <label className="finance-export-modal__field finance-export-modal__field--full">
                    <span>رمز العرض في الرابط</span>
                    <input
                      className="input-styled"
                      required
                      value={form.code ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                      placeholder="SUMMER5"
                      dir="ltr"
                    />
                  </label>
                ) : null}

                <label className="finance-export-modal__field">
                  <span>كل كم طلب يُفعَّل؟</span>
                  <input
                    className="input-styled"
                    type="number"
                    min={1}
                    required
                    value={form.ordersThreshold}
                    onChange={(e) => setForm((f) => ({ ...f, ordersThreshold: Number(e.target.value) || 1 }))}
                  />
                </label>

                <div className="finance-export-modal__field">
                  <span>الحالة</span>
                  <label className="promo-active-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(form.isActive)}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    />
                    <span>{form.isActive ? "نشط" : "موقوف"}</span>
                  </label>
                </div>

                <div className="finance-export-modal__field finance-export-modal__field--full">
                  <span>نوع المكافأة</span>
                  <div className="promo-choice-grid">
                    <button
                      type="button"
                      className={`promo-choice${form.rewardType === "FREE_ORDER" ? " promo-choice--active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, rewardType: "FREE_ORDER" }))}
                    >
                      <strong>طلب مجاني</strong>
                      <small>خصم كامل الأجرة عند الاستحقاق</small>
                    </button>
                    <button
                      type="button"
                      className={`promo-choice${form.rewardType === "FIXED_DISCOUNT" ? " promo-choice--active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, rewardType: "FIXED_DISCOUNT" }))}
                    >
                      <strong>خصم مالي</strong>
                      <small>مبلغ ثابت يُخصم من تكلفة الطلب</small>
                    </button>
                  </div>
                </div>

                {form.rewardType === "FIXED_DISCOUNT" ? (
                  <label className="finance-export-modal__field finance-export-modal__field--full">
                    <span>مبلغ الخصم (ل.س)</span>
                    <input
                      className="input-styled"
                      required
                      value={form.discountAmountText}
                      onChange={(e) => setForm((f) => ({ ...f, discountAmountText: e.target.value }))}
                      inputMode="decimal"
                      placeholder="مثال: 5000"
                      dir="ltr"
                    />
                  </label>
                ) : null}
              </div>
              </div>

              <div className="finance-export-modal__actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)} disabled={saving}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "جارٍ الحفظ..." : editingId ? "حفظ التعديلات" : "إنشاء العرض"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
