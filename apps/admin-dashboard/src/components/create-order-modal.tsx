"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, type OrderVehicleRequirement } from "../lib/api";

const VEHICLE_REQUIREMENT_OPTIONS: { value: OrderVehicleRequirement; label: string }[] = [
  { value: "ANY", label: "أي نوع" },
  { value: "PUBLIC", label: "عامة" },
  { value: "PRIVATE", label: "خاصة" },
  { value: "VIP", label: "VIP" }
];

const EMPTY_FORM = {
  customerName: "",
  customerPhone: "",
  pickupAddress: "",
  dropoffAddress: "",
  amount: "",
  notes: "",
  vehicleRequirement: "ANY" as OrderVehicleRequirement
};

export function CreateOrderModal({
  open,
  token,
  onClose,
  onCreated
}: {
  open: boolean;
  token: string;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    const amount = Number(form.amount.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل مبلغًا صالحًا أكبر من صفر.");
      return;
    }
    if (!form.pickupAddress.trim() || !form.dropoffAddress.trim()) {
      setError("أدخل عنوان الانطلاق والوجهة.");
      return;
    }
    if (!form.customerName.trim() && form.customerPhone.trim().length < 3) {
      setError("أدخل اسم الزبون أو رقم هاتف لا يقل عن 3 خانات.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.createOrder(token, {
        customerName: form.customerName.trim() || undefined,
        customerPhone: form.customerPhone.trim() || undefined,
        pickupAddress: form.pickupAddress.trim(),
        dropoffAddress: form.dropoffAddress.trim(),
        amount,
        notes: form.notes.trim() || undefined,
        broadcastTarget: "ALL",
        vehicleRequirement: form.vehicleRequirement
      });
      onClose();
      await onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()} role="presentation">
      <div className="card modal-panel modal-panel--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-panel__header">
          <div>
            <h3>إنشاء طلب جديد</h3>
            <p className="orders-room-toolbar__hint">يُبث الطلب مباشرة إلى السائقين كما يفعل المنسق.</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            إغلاق
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <form className="modal-form" onSubmit={(e) => void submitOrder(e)}>
          <div className="modal-form__grid">
            <input
              className="input-styled"
              placeholder="اسم الزبون (اختياري إذا وُجد الهاتف)"
              value={form.customerName}
              onChange={(e) => setForm((current) => ({ ...current, customerName: e.target.value }))}
            />
            <input
              className="input-styled"
              inputMode="tel"
              placeholder="هاتف الزبون"
              value={form.customerPhone}
              onChange={(e) => setForm((current) => ({ ...current, customerPhone: e.target.value }))}
            />
            <input
              className="input-styled"
              required
              placeholder="عنوان الانطلاق"
              value={form.pickupAddress}
              onChange={(e) => setForm((current) => ({ ...current, pickupAddress: e.target.value }))}
            />
            <input
              className="input-styled"
              required
              placeholder="الوجهة"
              value={form.dropoffAddress}
              onChange={(e) => setForm((current) => ({ ...current, dropoffAddress: e.target.value }))}
            />
            <input
              className="input-styled"
              required
              inputMode="decimal"
              placeholder="الأجرة"
              value={form.amount}
              onChange={(e) => setForm((current) => ({ ...current, amount: e.target.value }))}
            />
            <div className="select-wrap">
              <select
                className="select-styled"
                value={form.vehicleRequirement}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    vehicleRequirement: e.target.value as OrderVehicleRequirement
                  }))
                }
              >
                {VEHICLE_REQUIREMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="select-wrap__chevron" aria-hidden>
                ▼
              </span>
            </div>
            <textarea
              className="input-styled"
              placeholder="ملاحظات (اختياري)"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
            />
          </div>

          <div className="modal-form__actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "جاري البث..." : "إنشاء وبث الطلب"}
            </button>
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
