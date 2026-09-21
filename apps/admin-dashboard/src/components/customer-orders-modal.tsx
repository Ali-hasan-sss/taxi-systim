"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type AdminOrderStatus,
  type CustomerOrderHistoryRow,
  type CustomerOrdersResponse,
  type CustomerRow
} from "../lib/api";
import { useDebouncedSearch } from "../lib/use-debounced-value";

const STATUS_LABELS: Record<AdminOrderStatus, string> = {
  PENDING: "معلق",
  ACCEPTED: "مقبول",
  ARRIVED: "وصل",
  EN_ROUTE_TO_CUSTOMER: "في الطريق",
  STARTED: "بدأت الرحلة",
  STUCK: "متعثر",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى"
};

const VEHICLE_LABELS: Record<string, string> = {
  ANY: "أي نوع",
  PUBLIC: "سيارة عامة",
  PRIVATE: "سيارة خاصة",
  VIP: "VIP"
};

const SOURCE_LABELS: Record<string, string> = {
  APP: "التطبيق",
  WEB_PUBLIC: "الموقع"
};

const BROADCAST_LABELS: Record<string, string> = {
  ALL: "كل السائقين",
  NEAREST_THREE: "أقرب ثلاثة"
};

function formatMoney(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("ar-SY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(n);
}

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

function orderBadgeClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "finance-badge finance-badge--success";
    case "CANCELLED":
      return "finance-badge finance-badge--danger";
    case "STUCK":
      return "finance-badge finance-badge--warning";
    case "PENDING":
      return "finance-badge finance-badge--info";
    default:
      return "finance-badge finance-badge--info";
  }
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status as AdminOrderStatus] ?? status;
}

function driverName(order: CustomerOrderHistoryRow): string {
  return order.driver?.user.fullName?.trim() || "—";
}

function driverVehicle(order: CustomerOrderHistoryRow): string {
  if (!order.driver) return "—";
  const parts = [
    order.driver.vehicleBrand,
    order.driver.vehicleColor,
    order.driver.vehicleNumber
  ].filter((v) => v && v.trim());
  return parts.length > 0 ? parts.join(" · ") : "—";
}

type Props = {
  open: boolean;
  token: string;
  customer: CustomerRow | null;
  onClose: () => void;
  onSessionExpired?: () => void;
};

export function CustomerOrdersModal({ open, token, customer, onClose, onSessionExpired }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CustomerOrdersResponse | null>(null);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const { query: searchQuery, isPending: searchPending } = useDebouncedSearch(searchDraft);
  const [selected, setSelected] = useState<CustomerOrderHistoryRow | null>(null);

  const load = useCallback(async () => {
    if (!token || !customer) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listCustomerOrders(token, customer.id, {
        page,
        limit: 20,
        q: searchQuery || undefined
      });
      setData(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل سجل الطلبات";
      if (message === "SESSION_EXPIRED") {
        onSessionExpired?.();
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [customer, onSessionExpired, page, searchQuery, token]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (!open || !token || !customer) return;
    void load();
  }, [customer, load, open, token]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) setSelected(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open, selected]);

  if (!open || !customer) return null;

  const titleName = customer.name?.trim() || "زبون بدون اسم";
  const discount =
    selected?.discountAmount && Number(selected.discountAmount) > 0 ? selected.discountAmount : null;

  return (
    <div className="finance-export-modal" role="dialog" aria-modal="true" aria-labelledby="customer-orders-title">
      <button type="button" className="finance-export-modal__backdrop" onClick={onClose} aria-label="إغلاق" />
      <div className="card finance-export-modal__card customer-orders-modal__card">
        <div className="finance-export-modal__header">
          <div>
            <h3 id="customer-orders-title" className="finance-export-modal__title">
              {selected ? "تفاصيل الطلب" : "سجل الطلبات"}
            </h3>
            <p className="finance-export-modal__hint">
              {titleName} · <span dir="ltr">{customer.phoneDisplay}</span>
              {data ? ` · ${data.total.toLocaleString("ar")} طلب` : ""}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            إغلاق
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        {!selected ? (
          <label className="employees-search customer-orders-modal__search">
            <span className="sr-only">بحث باسم السائق</span>
            <input
              className="input-styled employees-search__input"
              type="search"
              placeholder="بحث باسم السائق في كل السجل…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              autoComplete="off"
            />
            {searchPending ? <span className="employees-search__pending">...</span> : null}
          </label>
        ) : null}

        {selected ? (
          <div className="customer-orders-modal__detail">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
              رجوع إلى السجل
            </button>
            <div className="customer-orders-modal__detail-grid">
              <div>
                <span>الحالة</span>
                <strong>
                  <span className={orderBadgeClass(selected.status)}>{statusLabel(selected.status)}</span>
                </strong>
              </div>
              <div>
                <span>التاريخ</span>
                <strong>{formatDateTime(selected.createdAt)}</strong>
              </div>
              <div>
                <span>المصدر</span>
                <strong>{selected.pickupAddress || "—"}</strong>
              </div>
              <div>
                <span>الوجهة</span>
                <strong>{selected.dropoffAddress || "—"}</strong>
              </div>
              <div>
                <span>الأجرة</span>
                <strong>{formatMoney(selected.amount)} ل.س</strong>
              </div>
              {discount ? (
                <div>
                  <span>الخصم</span>
                  <strong>{formatMoney(discount)} ل.س</strong>
                </div>
              ) : null}
              {selected.originalAmount && Number(selected.originalAmount) !== Number(selected.amount) ? (
                <div>
                  <span>الأجرة الأصلية</span>
                  <strong>{formatMoney(selected.originalAmount)} ل.س</strong>
                </div>
              ) : null}
              <div>
                <span>المنسق</span>
                <strong>{selected.coordinatorName || "—"}</strong>
              </div>
              <div>
                <span>السائق</span>
                <strong>{driverName(selected)}</strong>
              </div>
              <div>
                <span>هاتف السائق</span>
                <strong dir="ltr">{selected.driver?.user.phone || "—"}</strong>
              </div>
              <div>
                <span>المركبة</span>
                <strong>{driverVehicle(selected)}</strong>
              </div>
              <div>
                <span>نوع السيارة المطلوب</span>
                <strong>
                  {VEHICLE_LABELS[selected.vehicleRequirement ?? ""] ?? selected.vehicleRequirement ?? "—"}
                </strong>
              </div>
              <div>
                <span>قناة الطلب</span>
                <strong>{SOURCE_LABELS[selected.source ?? ""] ?? selected.source ?? "—"}</strong>
              </div>
              <div>
                <span>نطاق البث</span>
                <strong>{BROADCAST_LABELS[selected.broadcastTarget] ?? selected.broadcastTarget}</strong>
              </div>
              <div>
                <span>قبول السائق</span>
                <strong>{formatDateTime(selected.acceptedAt)}</strong>
              </div>
              <div>
                <span>بدء الرحلة</span>
                <strong>{formatDateTime(selected.startedAt)}</strong>
              </div>
              <div>
                <span>الإكمال</span>
                <strong>{formatDateTime(selected.completedAt)}</strong>
              </div>
              {selected.status === "CANCELLED" ? (
                <>
                  <div>
                    <span>تاريخ الإلغاء</span>
                    <strong>{formatDateTime(selected.cancelledAt)}</strong>
                  </div>
                  <div className="customer-orders-modal__detail-full">
                    <span>سبب الإلغاء</span>
                    <strong>{selected.cancelReason?.trim() || "—"}</strong>
                  </div>
                </>
              ) : null}
              {selected.notes?.trim() ? (
                <div className="customer-orders-modal__detail-full">
                  <span>ملاحظات</span>
                  <strong>{selected.notes}</strong>
                </div>
              ) : null}
            </div>
          </div>
        ) : loading && !data ? (
          <p className="loading-row">
            <span className="spinner" aria-hidden />
            جاري تحميل السجل...
          </p>
        ) : !data || data.orders.length === 0 ? (
          <p className="orders-room-empty">
            {searchQuery ? "لا توجد طلبات لسائق بهذا الاسم في سجل الزبون." : "لا توجد طلبات لهذا الزبون."}
          </p>
        ) : (
          <>
            <div className="table-scroll customer-orders-modal__table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>المصدر</th>
                    <th>الوجهة</th>
                    <th>الأجرة</th>
                    <th>الحالة</th>
                    <th>السائق</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr
                      key={order.id}
                      className="customer-orders-modal__row"
                      onClick={() => setSelected(order)}
                    >
                      <td>{formatDateTime(order.createdAt)}</td>
                      <td className="orders-data-table__address" title={order.pickupAddress}>
                        {order.pickupAddress}
                      </td>
                      <td className="orders-data-table__address" title={order.dropoffAddress}>
                        {order.dropoffAddress}
                      </td>
                      <td className="orders-data-table__amount">{formatMoney(order.amount)}</td>
                      <td>
                        <span className={orderBadgeClass(order.status)}>{statusLabel(order.status)}</span>
                      </td>
                      <td>{driverName(order)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(order);
                          }}
                        >
                          التفاصيل
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.total > data.limit ? (
              <div className="orders-room-load-more">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  السابق
                </button>
                <span>
                  صفحة {data.page} · {data.total.toLocaleString("ar")} طلب
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!data.hasMore || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  التالي
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
