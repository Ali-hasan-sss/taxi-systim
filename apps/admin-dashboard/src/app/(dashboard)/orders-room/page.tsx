"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { socketEvents } from "@taxi/config";
import { OrderRoomCard } from "../../../components/order-room-card";
import { CreateOrderModal } from "../../../components/create-order-modal";
import {
  api,
  getSocketOrigin,
  type AdminOrderRoomRow,
  type AdminOrdersRoomFilterCounts,
  type AdminOrdersRoomSegment
} from "../../../lib/api";
import { useOrdersRoomAlarm } from "../../../lib/use-orders-room-alarm";

const SESSION_KEY = "taxi_admin_session";
const ORDERS_PAGE_SIZE = 30;

type FilterDef = {
  key: AdminOrdersRoomSegment | null;
  label: string;
  countKey: keyof AdminOrdersRoomFilterCounts;
};

const FILTER_ROWS: FilterDef[][] = [
  [
    { key: null, label: "الكل", countKey: "all" },
    { key: "needs_invoice", label: "بحاجة فاتورة", countKey: "needs_invoice" },
    { key: "needs_info", label: "بحاجة معلومات", countKey: "needs_info" }
  ],
  [
    { key: "stuck", label: "متعثرة", countKey: "stuck" },
    { key: "pending", label: "معلقة", countKey: "pending" },
    { key: "in_progress", label: "في الطريق", countKey: "in_progress" }
  ]
];

const EMPTY_MESSAGES: Record<AdminOrdersRoomSegment | "all", string> = {
  all: "لا توجد طلبات نشطة.",
  needs_info: "لا توجد طلبات بحاجة لإرسال معلومات السائق.",
  needs_invoice: "لا توجد طلبات بحاجة لإرسال فاتورة.",
  stuck: "لا توجد طلبات متعثرة.",
  pending: "لا توجد طلبات معلقة.",
  in_progress: "لا توجد طلبات في الطريق."
};

function isActiveRoomOrder(order: AdminOrderRoomRow): boolean {
  return order.status !== "COMPLETED" && order.status !== "CANCELLED";
}

export default function OrdersRoomPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return (JSON.parse(raw) as { accessToken: string }).accessToken;
    } catch {
      return null;
    }
  }, []);

  const [orders, setOrders] = useState<AdminOrderRoomRow[]>([]);
  const [filterCounts, setFilterCounts] = useState<AdminOrdersRoomFilterCounts>({
    all: 0,
    needs_info: 0,
    needs_invoice: 0,
    stuck: 0,
    pending: 0,
    in_progress: 0
  });
  const [segment, setSegment] = useState<AdminOrdersRoomSegment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [editDetailsOrder, setEditDetailsOrder] = useState<AdminOrderRoomRow | null>(null);
  const [editAmountOrder, setEditAmountOrder] = useState<AdminOrderRoomRow | null>(null);
  const [detailsForm, setDetailsForm] = useState({
    customerName: "",
    customerPhone: "",
    pickupAddress: "",
    dropoffAddress: "",
    notes: ""
  });
  const [amountDraft, setAmountDraft] = useState("");
  const [savingModal, setSavingModal] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const loadLockRef = useRef(false);
  const nextCursorRef = useRef<string | null>(null);

  const visibleOrders = useMemo(() => orders.filter(isActiveRoomOrder), [orders]);
  const { alarmActive, muted, muteAlarm } = useOrdersRoomAlarm(visibleOrders);

  const loadInitial = useCallback(
    async (isRefresh = false) => {
      if (!token) {
        router.replace("/login");
        return;
      }
      if (loadLockRef.current) return;
      loadLockRef.current = true;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [listResult, stats] = await Promise.all([
          api.listOrdersRoom(token, segment, { limit: ORDERS_PAGE_SIZE }),
          api.getOrdersRoomStats(token)
        ]);
        setOrders(listResult.orders.filter(isActiveRoomOrder));
        setNextCursor(listResult.nextCursor);
        nextCursorRef.current = listResult.nextCursor;
        setFilterCounts(stats);
      } catch {
        localStorage.removeItem(SESSION_KEY);
        router.replace("/login");
      } finally {
        loadLockRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, router, segment]
  );

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!token || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const listResult = await api.listOrdersRoom(token, segment, {
        cursor,
        limit: ORDERS_PAGE_SIZE
      });
      setOrders((prev) => {
        const seen = new Set(prev.map((o) => o.id));
        const extra = listResult.orders.filter((o) => !seen.has(o.id) && isActiveRoomOrder(o));
        return extra.length ? [...prev, ...extra] : prev;
      });
      setNextCursor(listResult.nextCursor);
      nextCursorRef.current = listResult.nextCursor;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      router.replace("/login");
    } finally {
      setLoadingMore(false);
    }
  }, [token, router, segment, loadingMore]);

  useEffect(() => {
    nextCursorRef.current = null;
    setNextCursor(null);
    void loadInitial(false);
  }, [loadInitial]);

  useEffect(() => {
    if (!token) return;
    const origin = getSocketOrigin();
    const socket = io(origin, { transports: ["websocket"] });
    socketRef.current = socket;

    const onConnect = () => {
      setLive(true);
      socket.emit("admin:register");
    };
    const onDisconnect = () => setLive(false);
    const reload = () => void loadInitial(true);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(socketEvents.NEW_ORDER, reload);
    socket.on(socketEvents.ORDER_ASSIGNED, reload);
    socket.on(socketEvents.ORDER_STATUS_UPDATED, reload);
    socket.on(socketEvents.ORDER_PENDING_CANCELLED, reload);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(socketEvents.NEW_ORDER, reload);
      socket.off(socketEvents.ORDER_ASSIGNED, reload);
      socket.off(socketEvents.ORDER_STATUS_UPDATED, reload);
      socket.off(socketEvents.ORDER_PENDING_CANCELLED, reload);
      socket.disconnect();
    };
  }, [token, loadInitial]);

  const openEditDetails = (order: AdminOrderRoomRow) => {
    setEditDetailsOrder(order);
    setDetailsForm({
      customerName: order.customerName ?? "",
      customerPhone: order.customerPhone ?? "",
      pickupAddress: order.pickupAddress ?? "",
      dropoffAddress: order.dropoffAddress ?? "",
      notes: order.notes ?? ""
    });
    setError(null);
  };

  const openEditAmount = (order: AdminOrderRoomRow) => {
    setEditAmountOrder(order);
    setAmountDraft(String(order.amount ?? ""));
    setError(null);
  };

  const runAction = async (orderId: string, action: () => Promise<void>) => {
    if (!token) return;
    setActionLoadingId(orderId);
    setError(null);
    try {
      await action();
      await loadInitial(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء");
    } finally {
      setActionLoadingId(null);
    }
  };

  const submitDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !editDetailsOrder) return;
    setSavingModal(true);
    setError(null);
    try {
      await api.updateAdminOrderDetails(token, editDetailsOrder.id, {
        customerName: detailsForm.customerName.trim() || undefined,
        customerPhone: detailsForm.customerPhone.trim() || undefined,
        pickupAddress: detailsForm.pickupAddress.trim() || undefined,
        dropoffAddress: detailsForm.dropoffAddress.trim() || undefined,
        notes: detailsForm.notes.trim() || undefined
      });
      setEditDetailsOrder(null);
      await loadInitial(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ التعديلات");
    } finally {
      setSavingModal(false);
    }
  };

  const submitAmount = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !editAmountOrder) return;
    const amount = Number(amountDraft.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل أجرة صالحة أكبر من صفر.");
      return;
    }
    setSavingModal(true);
    setError(null);
    try {
      await api.updateAdminOrderAmount(token, editAmountOrder.id, amount);
      setEditAmountOrder(null);
      await loadInitial(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تعديل الأجرة");
    } finally {
      setSavingModal(false);
    }
  };

  const cardActions = useMemo(
    () => ({
      onEditDetails: openEditDetails,
      onEditAmount: openEditAmount,
      onDelete: (order: AdminOrderRoomRow) => {
        if (!token) return;
        if (!confirm(`حذف الطلب الخاص بـ ${order.customerName}؟`)) return;
        void runAction(order.id, async () => {
          await api.deleteAdminOrder(token, order.id);
        });
      },
      onCancel: (order: AdminOrderRoomRow) => {
        if (!token) return;
        const label = order.status === "PENDING" ? "إلغاء هذا الطلب المعلق؟" : "إلغاء هذا الطلب المتعثر؟";
        if (!confirm(label)) return;
        void runAction(order.id, async () => {
          await api.cancelAdminOrder(token, order.id);
        });
      },
      onResume: (order: AdminOrderRoomRow) => {
        if (!token) return;
        void runAction(order.id, async () => {
          await api.resumeStuckAdminOrder(token, order.id);
        });
      }
    }),
    [token, loadInitial]
  );

  const emptyMessage = segment ? EMPTY_MESSAGES[segment] : EMPTY_MESSAGES.all;

  if (loading && visibleOrders.length === 0) {
    return (
      <div className="dashboard-page-loading">
        <span className="spinner" aria-hidden />
        جاري تحميل غرفة الطلبات...
      </div>
    );
  }

  return (
    <div className="dashboard-page orders-room-page">
      <section className="card orders-room-toolbar">
        <div className="orders-room-toolbar__head">
          <div>
            <h2 className="orders-room-toolbar__title">غرفة الطلبات</h2>
            <p className="orders-room-toolbar__hint">مراقبة مباشرة للطلبات النشطة — التحديث فوري عبر السوكيت</p>
          </div>
          <div className="orders-room-toolbar__badges">
            <button type="button" className="btn btn-primary" onClick={() => setCreateOrderOpen(true)}>
              + إنشاء طلب
            </button>
            {alarmActive ? (
              <div className="orders-room-alarm" role="status">
                <span>تنبيه: طلب معلق متأخر (+90 ث)</span>
                {!muted ? (
                  <button type="button" className="orders-room-alarm__btn" onClick={muteAlarm}>
                    إيقاف الإنذار
                  </button>
                ) : (
                  <span>متوقف مؤقتًا</span>
                )}
              </div>
            ) : null}
            <span className={`orders-room-live${live ? " orders-room-live--on" : ""}`}>
              {live ? "● مباشر" : "○ غير متصل"}
            </span>
            {refreshing ? (
              <span className="orders-room-refresh">
                <span className="spinner-inline" aria-hidden />
                تحديث...
              </span>
            ) : null}
          </div>
        </div>

        <div className="orders-room-filters">
          {FILTER_ROWS.map((row, rowIdx) => (
            <div key={rowIdx} className="orders-room-filters__row">
              {row.map((filter) => {
                const active = segment === filter.key;
                const count = filterCounts[filter.countKey];
                return (
                  <button
                    key={filter.label}
                    type="button"
                    className={`orders-room-filter${active ? " orders-room-filter--active" : ""}`}
                    onClick={() => setSegment(filter.key)}
                  >
                    {filter.label}
                    <span className="orders-room-filter__count">{count}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {error ? <p className="form-error">{error}</p> : null}

      {visibleOrders.length === 0 ? (
        <p className="orders-room-empty">{emptyMessage}</p>
      ) : (
        <>
          <section className="orders-room-grid">
            {visibleOrders.map((order) => (
              <OrderRoomCard
                key={order.id}
                order={order}
                actionLoadingId={actionLoadingId}
                actions={cardActions}
              />
            ))}
          </section>
          {nextCursor ? (
            <div className="orders-room-load-more">
              <button
                type="button"
                className="btn btn-ghost orders-room-load-more__btn"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <span className="spinner-inline" aria-hidden />
                    جاري التحميل…
                  </>
                ) : (
                  "تحميل المزيد"
                )}
              </button>
            </div>
          ) : null}
        </>
      )}

      {token ? (
        <CreateOrderModal
          open={createOrderOpen}
          token={token}
          onClose={() => setCreateOrderOpen(false)}
          onCreated={() => loadInitial(true)}
        />
      ) : null}

      {editDetailsOrder ? (
        <div className="modal-backdrop" onClick={() => !savingModal && setEditDetailsOrder(null)} role="presentation">
          <div className="card modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-panel__header">
              <h3>
                {editDetailsOrder.status === "STUCK" ? "تعديل تفاصيل الطلب المتعثر" : "تعديل تفاصيل الطلب"}
              </h3>
              <button type="button" className="btn btn-ghost" onClick={() => setEditDetailsOrder(null)} disabled={savingModal}>
                إغلاق
              </button>
            </div>
            <form className="modal-form" onSubmit={(e) => void submitDetails(e)}>
              <div className="modal-form__grid">
                <input
                  className="input-styled"
                  placeholder="اسم الزبون"
                  value={detailsForm.customerName}
                  onChange={(e) => setDetailsForm((c) => ({ ...c, customerName: e.target.value }))}
                />
                <input
                  className="input-styled"
                  placeholder="هاتف الزبون"
                  value={detailsForm.customerPhone}
                  onChange={(e) => setDetailsForm((c) => ({ ...c, customerPhone: e.target.value }))}
                />
                <input
                  className="input-styled"
                  placeholder="من"
                  value={detailsForm.pickupAddress}
                  onChange={(e) => setDetailsForm((c) => ({ ...c, pickupAddress: e.target.value }))}
                />
                <input
                  className="input-styled"
                  placeholder="إلى"
                  value={detailsForm.dropoffAddress}
                  onChange={(e) => setDetailsForm((c) => ({ ...c, dropoffAddress: e.target.value }))}
                />
                <textarea
                  className="input-styled"
                  placeholder="ملاحظات"
                  rows={3}
                  value={detailsForm.notes}
                  onChange={(e) => setDetailsForm((c) => ({ ...c, notes: e.target.value }))}
                />
              </div>
              <div className="modal-form__actions">
                <button type="submit" className="btn btn-primary" disabled={savingModal}>
                  {savingModal ? "جارٍ الحفظ..." : "حفظ التعديلات"}
                </button>
                <button type="button" className="btn" onClick={() => setEditDetailsOrder(null)} disabled={savingModal}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editAmountOrder ? (
        <div className="modal-backdrop" onClick={() => !savingModal && setEditAmountOrder(null)} role="presentation">
          <div className="card modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-panel__header">
              <h3>تعديل أجرة الطلب</h3>
              <button type="button" className="btn btn-ghost" onClick={() => setEditAmountOrder(null)} disabled={savingModal}>
                إغلاق
              </button>
            </div>
            <form className="modal-form" onSubmit={(e) => void submitAmount(e)}>
              <input
                className="input-styled"
                inputMode="decimal"
                placeholder="الأجرة الجديدة"
                value={amountDraft}
                onChange={(e) => setAmountDraft(e.target.value)}
                required
              />
              <div className="modal-form__actions">
                <button type="submit" className="btn btn-primary" disabled={savingModal}>
                  {savingModal ? "جارٍ الحفظ..." : "حفظ الأجرة"}
                </button>
                <button type="button" className="btn" onClick={() => setEditAmountOrder(null)} disabled={savingModal}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
