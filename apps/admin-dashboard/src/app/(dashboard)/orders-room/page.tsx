"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { socketEvents } from "@taxi/config";
import { OrderRoomCard } from "../../../components/order-room-card";
import {
  api,
  getSocketOrigin,
  type AdminOrderRoomRow,
  type AdminOrdersRoomFilterCounts,
  type AdminOrdersRoomSegment
} from "../../../lib/api";

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
  ],
  [{ key: "completed", label: "مكتملة", countKey: "completed" }]
];

const EMPTY_MESSAGES: Record<AdminOrdersRoomSegment | "all", string> = {
  all: "لا توجد طلبات نشطة.",
  needs_info: "لا توجد طلبات بحاجة لإرسال معلومات السائق.",
  needs_invoice: "لا توجد طلبات بحاجة لإرسال فاتورة.",
  stuck: "لا توجد طلبات متعثرة.",
  pending: "لا توجد طلبات معلقة.",
  completed: "لا توجد طلبات مكتملة.",
  in_progress: "لا توجد طلبات في الطريق."
};

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
    completed: 0,
    in_progress: 0
  });
  const [segment, setSegment] = useState<AdminOrdersRoomSegment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const loadLockRef = useRef(false);
  const nextCursorRef = useRef<string | null>(null);

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
      try {
        const [listResult, stats] = await Promise.all([
          api.listOrdersRoom(token, segment, { limit: ORDERS_PAGE_SIZE }),
          api.getOrdersRoomStats(token)
        ]);
        setOrders(listResult.orders);
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
        const extra = listResult.orders.filter((o) => !seen.has(o.id));
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

  const emptyMessage = segment ? EMPTY_MESSAGES[segment] : EMPTY_MESSAGES.all;

  if (loading && orders.length === 0) {
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
            <p className="orders-room-toolbar__hint">مراقبة مباشرة لكل الطلبات — التحديث فوري عبر السوكيت</p>
          </div>
          <div className="orders-room-toolbar__badges">
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

      {orders.length === 0 ? (
        <p className="orders-room-empty">{emptyMessage}</p>
      ) : (
        <>
          <section className="orders-room-grid">
            {orders.map((order) => (
              <OrderRoomCard key={order.id} order={order} />
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
    </div>
  );
}
