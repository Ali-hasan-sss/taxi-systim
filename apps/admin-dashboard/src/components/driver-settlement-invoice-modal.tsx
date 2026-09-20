"use client";

import { useMemo, useState } from "react";
import type { DriverSettlementInvoice } from "../lib/api";
import { formatSyrianAmount } from "../lib/remaining-balance";

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SY", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Damascus"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatYmd(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [year, month, day] = ymd.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat("ar-SY", {
      dateStyle: "medium",
      timeZone: "UTC"
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  } catch {
    return ymd;
  }
}

function money(value: string | number): string {
  return `${formatSyrianAmount(value)} ل.س`;
}

function syriaWaPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("963") && d.length >= 11) return d;
  if (d.startsWith("0") && d.length >= 9) return `963${d.slice(1)}`;
  if (d.startsWith("9") && d.length === 9) return `963${d}`;
  return d.length >= 8 ? d : null;
}

export function buildSettlementInvoiceText(invoice: DriverSettlementInvoice): string {
  const lines = [
    "فاتورة تسديد سائق",
    `السائق: ${invoice.driverName}`,
    `فترة الفاتورة: من ${formatYmd(invoice.periodFrom)} إلى ${formatYmd(invoice.periodTo)}`,
    `تاريخ التسديد: ${formatDateTime(invoice.settledAt)}`,
    "",
    `العمولات: ${money(invoice.totals.commissionAmount)}`,
    ...invoice.commissions.map(
      (row) => `• ${money(row.amount)} — ${formatDateTime(row.completedAt ?? row.createdAt)}`
    ),
    "",
    `الغرامات: ${money(invoice.totals.fineAmount)}`,
    ...invoice.fines.map(
      (row) => `• ${money(row.amount)} — ${row.reason ?? "—"} · ${formatDateTime(row.createdAt)}`
    ),
    "",
    `التعويضات: ${money(invoice.totals.compensationAmount)}`,
    ...invoice.compensations.map(
      (row) => `• ${money(row.amount)} — ${row.reason ?? "—"} · ${formatDateTime(row.createdAt)}`
    ),
    "",
    `الإجمالي المترتب: ${money(invoice.totals.netAmount)}`
  ];
  return lines.join("\n");
}

type Props = {
  invoice: DriverSettlementInvoice;
  onClose: () => void;
};

export function DriverSettlementInvoiceModal({ invoice, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => buildSettlementInvoiceText(invoice), [invoice]);
  const waUrl = useMemo(() => {
    const n = syriaWaPhone(invoice.driverPhone);
    if (!n) return null;
    return `https://wa.me/${n}?${new URLSearchParams({ text }).toString()}`;
  }, [invoice.driverPhone, text]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="finance-export-modal" role="dialog" aria-modal="true" aria-labelledby="settlement-invoice-title">
      <button type="button" className="finance-export-modal__backdrop" onClick={onClose} aria-label="إغلاق" />
      <div className="card finance-export-modal__card finance-invoice-card">
        <div className="finance-export-modal__header">
          <div>
            <h3 id="settlement-invoice-title" className="finance-export-modal__title">
              فاتورة تسديد
            </h3>
            <p className="finance-export-modal__hint">
              السائق: {invoice.driverName}
              {invoice.driverPhone ? ` · ${invoice.driverPhone}` : ""}
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إغلاق
          </button>
        </div>

        <div className="finance-invoice-body">
          <div className="finance-invoice-meta">
            <div>
              <span>فترة الفاتورة</span>
              <strong>
                من {formatYmd(invoice.periodFrom)} إلى {formatYmd(invoice.periodTo)}
              </strong>
            </div>
            <div>
              <span>تاريخ التسديد</span>
              <strong>{formatDateTime(invoice.settledAt)}</strong>
            </div>
          </div>

          <section>
            <h4>العمولات ({money(invoice.totals.commissionAmount)})</h4>
            {invoice.commissions.length === 0 ? (
              <p>لا توجد عمولات في هذه الفاتورة.</p>
            ) : (
              <ul>
                {invoice.commissions.map((row) => (
                  <li key={row.orderId ?? row.amount + (row.completedAt ?? "")}>
                    {money(row.amount)} — {formatDateTime(row.completedAt)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4>الغرامات ({money(invoice.totals.fineAmount)})</h4>
            {invoice.fines.length === 0 ? (
              <p>لا توجد غرامات في هذه الفاتورة.</p>
            ) : (
              <ul>
                {invoice.fines.map((row) => (
                  <li key={row.id}>
                    {money(row.amount)} — {row.reason ?? "—"} · {formatDateTime(row.createdAt)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4>التعويضات ({money(invoice.totals.compensationAmount)})</h4>
            {invoice.compensations.length === 0 ? (
              <p>لا توجد تعويضات ضمن فترة الفاتورة.</p>
            ) : (
              <ul>
                {invoice.compensations.map((row) => (
                  <li key={row.id}>
                    {money(row.amount)} — {row.reason ?? "—"} · {formatDateTime(row.createdAt)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="finance-invoice-total">الإجمالي المترتب: {money(invoice.totals.netAmount)}</div>
        </div>

        <div className="finance-export-modal__actions finance-invoice-actions">
          <button type="button" className="btn" onClick={() => window.print()}>
            طباعة
          </button>
          <button type="button" className="btn" onClick={() => void copyText()}>
            {copied ? "تم النسخ" : "نسخ الفاتورة"}
          </button>
          {waUrl ? (
            <a className="btn btn-primary" href={waUrl} target="_blank" rel="noreferrer">
              إرسال عبر واتساب
            </a>
          ) : (
            <button type="button" className="btn btn-primary" disabled>
              لا يوجد رقم لإرسال واتساب
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
