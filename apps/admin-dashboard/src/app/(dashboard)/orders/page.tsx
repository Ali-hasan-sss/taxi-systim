"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type AdminOrderRoomRow,
  type AdminOrderStatus,
  type AdminOrderStatusFilter
} from "../../../lib/api";
import { useDebouncedSearch } from "../../../lib/use-debounced-value";

const PAGE_SIZE = 20;

const STATUS_FILTERS: { key: AdminOrderStatusFilter; label: string }[] = [
  { key: "ALL", label: "الكل" },
  { key: "PENDING", label: "معلق" },
  { key: "ACCEPTED", label: "مقبول" },
  { key: "ARRIVED", label: "وصل" },
  { key: "EN_ROUTE_TO_CUSTOMER", label: "في الطريق" },
  { key: "STARTED", label: "بدأت الرحلة" },
  { key: "STUCK", label: "متعثر" },
  { key: "COMPLETED", label: "مكتمل" },
  { key: "CANCELLED", label: "ملغى" }
];

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

function formatMoney(value: string | number): string {
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
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return iso;
  }
}

function orderBadgeClass(status: AdminOrderStatus): string {
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

function driverName(order: AdminOrderRoomRow): string {
  return order.driver?.user.fullName?.trim() || "—";
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<AdminOrderRoomRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<AdminOrderStatusFilter>("ALL");
  const [searchDraft, setSearchDraft] = useState("");
  const { query: searchQuery, isPending: searchPending } = useDebouncedSearch(searchDraft);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({ all: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editOrder, setEditOrder] = useState<AdminOrderRoomRow | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [savingAmount, setSavingAmount] = useState(false);

  const [deleteOrder, setDeleteOrder] = useState<AdminOrderRoomRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const token = useMemo(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("taxi_admin_session") : null;
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { accessToken: string }).accessToken;
    } catch {
      return null;
    }
  }, []);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const stats = await api.getAdminOrdersStats(token);
      setStatusCounts({ all: stats.all, ...stats.byStatus });
    } catch {
      /* optional */
    }
  }, [token]);

  const loadOrders = useCallback(async () => {
    if (!token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.listAdminOrders(token, {
        status: statusFilter,
        q: searchQuery || undefined,
        page,
        limit: PAGE_SIZE
      });
      setOrders(result.orders);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل الطلبات";
      if (message === "SESSION_EXPIRED") {
        api.clearSession();
        router.replace("/login");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, searchQuery, page, router]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const openEditModal = (order: AdminOrderRoomRow) => {
    setEditOrder(order);
    setEditAmount(order.amount);
    setNotice(null);
  };

  const closeEditModal = () => {
    setEditOrder(null);
    setEditAmount("");
  };

  const onSaveAmount = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !editOrder) return;
    const amount = Number.parseFloat(editAmount.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل مبلغًا صالحًا أكبر من صفر");
      return;
    }
    setSavingAmount(true);
    setError(null);
    try {
      const updated = await api.updateAdminOrderAmount(token, editOrder.id, amount);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setNotice("تم تحديث الأجرة بنجاح");
      closeEditModal();
      void loadStats();
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تعديل الأجرة";
      if (message === "SESSION_EXPIRED") {
        api.clearSession();
        router.replace("/login");
        return;
      }
      setError(message);
    } finally {
      setSavingAmount(false);
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteOrder) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteAdminOrder(token, deleteOrder.id);
      setNotice("تم حذف الطلب بنجاح");
      setDeleteOrder(null);
      if (orders.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        void loadOrders();
      }
      void loadStats();
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر حذف الطلب";
      if (message === "SESSION_EXPIRED") {
        api.clearSession();
        router.replace("/login");
        return;
      }
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return [] as number[];
    const maxButtons = 5;
    let start = Math.max(1, page - Math.floor(maxButtons / 2));
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    const nums: number[] = [];
    for (let i = start; i <= end; i += 1) nums.push(i);
    return nums;
  }, [page, totalPages]);

  const filterCount = (key: AdminOrderStatusFilter) => {
    if (key === "ALL") return statusCounts.all ?? 0;
    return statusCounts[key] ?? 0;
  };

  return (
    <div className="dashboard-page orders-page">
      <div className="card orders-toolbar">
        <div className="orders-toolbar__main">
          <label className="employees-search">
            <span className="sr-only">بحث في الطلبات</span>
            <input
              className="input-styled employees-search__input"
              type="search"
              placeholder="بحث: السائق، المنسق، المصدر، الوجهة..."
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              autoComplete="off"
            />
            {searchPending ? <span className="employees-search__pending">...</span> : null}
          </label>
          <p className="employees-toolbar__hint">
            {total > 0 ? `${total.toLocaleString("ar")} طلب` : "لا توجد نتائج"}
          </p>
        </div>

        <div className="orders-room-filters orders-page-filters">
          <div className="orders-room-filters__row">
            {STATUS_FILTERS.map((filter) => {
              const active = statusFilter === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  className={`orders-room-filter${active ? " orders-room-filter--active" : ""}`}
                  onClick={() => {
                    setStatusFilter(filter.key);
                    setPage(1);
                  }}
                >
                  {filter.label}
                  <span className="orders-room-filter__count">{filterCount(filter.key)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section className="card employees-table-card orders-table-card">
        <div className="employees-table-head">
          <h3 className="employees-table-head__title">جدول الطلبات</h3>
          <span className="orders-table-card__meta">
            صفحة {page.toLocaleString("ar")} من {Math.max(totalPages, 1).toLocaleString("ar")}
          </span>
        </div>

        {notice ? <p className="orders-notice">{notice}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        {loading ? (
          <p className="loading-row">
            <span className="spinner" aria-hidden />
            جاري تحميل الطلبات...
          </p>
        ) : orders.length === 0 ? (
          <p className="orders-room-empty">لا توجد طلبات مطابقة للبحث أو الفلتر الحالي.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table orders-data-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>المنسق</th>
                    <th>السائق</th>
                    <th>المصدر</th>
                    <th>الوجهة</th>
                    <th>الأجرة</th>
                    <th>الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="orders-data-table__date">{formatDateTime(order.createdAt)}</td>
                      <td>{order.coordinatorName || "—"}</td>
                      <td>{driverName(order)}</td>
                      <td className="orders-data-table__address" title={order.pickupAddress}>
                        {order.pickupAddress}
                      </td>
                      <td className="orders-data-table__address" title={order.dropoffAddress}>
                        {order.dropoffAddress}
                      </td>
                      <td className="orders-data-table__amount">{formatMoney(order.amount)}</td>
                      <td>
                        <span className={orderBadgeClass(order.status as AdminOrderStatus)}>
                          {STATUS_LABELS[order.status as AdminOrderStatus] ?? order.status}
                        </span>
                      </td>
                      <td className="cell-actions">
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={order.status === "CANCELLED"}
                          onClick={() => openEditModal(order)}
                        >
                          تعديل الأجرة
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger-outline"
                          disabled={deleting && deleteOrder?.id === order.id}
                          onClick={() => {
                            setDeleteOrder(order);
                            setNotice(null);
                          }}
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <nav className="orders-pagination" aria-label="ترقيم الصفحات">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  السابق
                </button>
                <div className="orders-pagination__pages">
                  {pageNumbers.map((num) => (
                    <button
                      key={num}
                      type="button"
                      className={`orders-pagination__page${num === page ? " orders-pagination__page--active" : ""}`}
                      onClick={() => setPage(num)}
                      aria-current={num === page ? "page" : undefined}
                    >
                      {num.toLocaleString("ar")}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  التالي
                </button>
              </nav>
            ) : null}
          </>
        )}
      </section>

      {editOrder ? (
        <div className="modal-backdrop" onClick={closeEditModal} role="presentation">
          <div
            className="card modal-panel orders-edit-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-order-title"
          >
            <div className="modal-panel__header">
              <h3 id="edit-order-title">تعديل أجرة الطلب</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeEditModal} disabled={savingAmount}>
                إغلاق
              </button>
            </div>
            <p className="orders-edit-modal__summary">
              {editOrder.pickupAddress} ← {editOrder.dropoffAddress}
            </p>
            <form className="modal-form" onSubmit={(e) => void onSaveAmount(e)}>
              <label className="orders-edit-modal__field">
                <span>الأجرة (ل.س)</span>
                <input
                  className="input-styled"
                  type="number"
                  min="1"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <div className="modal-form__actions">
                <button type="submit" className="btn btn-primary" disabled={savingAmount}>
                  {savingAmount ? (
                    <>
                      <span className="spinner-inline" aria-hidden />
                      جاري الحفظ...
                    </>
                  ) : (
                    "حفظ الأجرة"
                  )}
                </button>
                <button type="button" className="btn btn-ghost" onClick={closeEditModal} disabled={savingAmount}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteOrder ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="card modal-panel orders-delete-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-order-title"
            aria-describedby="delete-order-desc"
          >
            <div className="orders-delete-modal__icon" aria-hidden>
              !
            </div>
            <h3 id="delete-order-title">تأكيد حذف الطلب</h3>
            <p id="delete-order-desc" className="orders-delete-modal__text">
              هل أنت متأكد من حذف هذا الطلب نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="orders-delete-modal__details">
              <div>
                <span>المنسق</span>
                <strong>{deleteOrder.coordinatorName || "—"}</strong>
              </div>
              <div>
                <span>السائق</span>
                <strong>{driverName(deleteOrder)}</strong>
              </div>
              <div>
                <span>المسار</span>
                <strong>
                  {deleteOrder.pickupAddress} → {deleteOrder.dropoffAddress}
                </strong>
              </div>
              <div>
                <span>الأجرة</span>
                <strong>{formatMoney(deleteOrder.amount)} ل.س</strong>
              </div>
            </div>
            <div className="orders-delete-modal__actions">
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? (
                  <>
                    <span className="spinner-inline" aria-hidden />
                    جاري الحذف...
                  </>
                ) : (
                  "نعم، احذف الطلب"
                )}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={deleting}
                onClick={() => setDeleteOrder(null)}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
