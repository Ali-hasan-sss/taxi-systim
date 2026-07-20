"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type DriverFinesLedger } from "../lib/api";

function formatMoney(value: string | number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("ar-SY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(n);
}

function formatDateTime(iso: string) {
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

type Props = {
  open: boolean;
  token: string;
  driverId?: string;
  from?: string;
  to?: string;
  onClose: () => void;
  onSessionExpired?: () => void;
  onSettled?: () => void;
};

export function DriverFinesModal({
  open,
  token,
  driverId,
  from,
  to,
  onClose,
  onSessionExpired,
  onSettled
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ledger, setLedger] = useState<DriverFinesLedger | null>(null);
  const [settlingFineId, setSettlingFineId] = useState<string | null>(null);
  const showDriverColumn = !driverId;

  const loadLedger = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.listDriverFines(token, { driverId, from, to });
      setLedger(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل سجل الغرامات";
      if (message === "SESSION_EXPIRED") {
        onSessionExpired?.();
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [driverId, from, onSessionExpired, to, token]);

  useEffect(() => {
    if (!open || !token) return;
    setLedger(null);
    setNotice(null);
    void loadLedger();
  }, [loadLedger, open, token]);

  const settleFine = async (fineId: string) => {
    if (!token) return;
    if (!window.confirm("تسديد هذه الغرامة؟")) return;
    setSettlingFineId(fineId);
    setError(null);
    setNotice(null);
    try {
      const result = await api.settleDriverFine(token, { fineId });
      setNotice(`تم تسديد غرامة بمبلغ ${formatMoney(result.amount)}.`);
      await loadLedger();
      onSettled?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل تسديد الغرامة";
      if (message === "SESSION_EXPIRED") {
        onSessionExpired?.();
        return;
      }
      setError(message);
    } finally {
      setSettlingFineId(null);
    }
  };

  if (!open) return null;

  const subtitle = (() => {
    if (ledger?.driver?.fullName) return `السائق: ${ledger.driver.fullName}`;
    if (driverId) return "تحميل بيانات السائق...";
    return "جميع السائقين";
  })();

  return (
    <div className="finance-export-modal" role="dialog" aria-modal="true" aria-labelledby="driver-fines-title">
      <button type="button" className="finance-export-modal__backdrop" onClick={onClose} aria-label="إغلاق" />
      <div className="card finance-export-modal__card finance-fines-modal__card">
        <div className="finance-export-modal__header">
          <div>
            <h3 id="driver-fines-title" className="finance-export-modal__title">
              سجل الغرامات
            </h3>
            <p className="finance-export-modal__hint">
              {subtitle}
              {from && to ? ` · الفترة من ${from} إلى ${to}` : " · كل الفترات"}
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إغلاق
          </button>
        </div>

        {loading && !ledger ? (
          <p className="loading-row">
            <span className="spinner" aria-hidden />
            جاري تحميل سجل الغرامات...
          </p>
        ) : error && !ledger ? (
          <p className="form-error">{error}</p>
        ) : ledger ? (
          <>
            {error ? <p className="form-error">{error}</p> : null}
            {notice ? <p className="settings-notice">{notice}</p> : null}
            <div className="finance-fines-modal__summary">
              <div>
                <span>عدد الغرامات</span>
                <strong>{ledger.count}</strong>
              </div>
              <div>
                <span>غير المسددة</span>
                <strong>
                  {ledger.unpaidCount ?? 0} · {formatMoney(ledger.unpaidAmount ?? "0")}
                </strong>
              </div>
              <div>
                <span>المجموع الكلي</span>
                <strong>{formatMoney(ledger.totalAmount)}</strong>
              </div>
            </div>

            {ledger.rows.length === 0 ? (
              <p className="finance-fines-modal__empty">لا توجد غرامات مسجّلة.</p>
            ) : (
              <div className="table-scroll finance-fines-modal__table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      {showDriverColumn ? <th>السائق</th> : null}
                      <th>المبلغ</th>
                      <th>السبب</th>
                      <th>الحالة</th>
                      <th>بواسطة</th>
                      <th>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.rows.map((row) => {
                      const paid = Boolean(row.isPaid);
                      return (
                        <tr key={row.id}>
                          <td>{formatDateTime(row.createdAt)}</td>
                          {showDriverColumn ? <td>{row.driverName ?? "—"}</td> : null}
                          <td>{formatMoney(row.amount)}</td>
                          <td>{row.reason}</td>
                          <td>
                            <span className={paid ? "finance-fine-status--paid" : "finance-fine-status--unpaid"}>
                              {paid ? "مسدد" : "غير مسدد"}
                            </span>
                          </td>
                          <td>{row.createdByName ?? "—"}</td>
                          <td>
                            {paid ? (
                              "—"
                            ) : (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={settlingFineId === row.id || loading}
                                onClick={() => void settleFine(row.id)}
                              >
                                {settlingFineId === row.id ? "جارٍ..." : "تسديد"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        <div className="finance-export-modal__actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            حسناً
          </button>
        </div>
      </div>
    </div>
  );
}
