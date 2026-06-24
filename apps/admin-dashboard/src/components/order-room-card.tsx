"use client";

import { Banknote, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AdminOrderRoomRow } from "../lib/api";
import { ORDERS_ROOM_DELAY_MS } from "../lib/use-orders-room-alarm";

const STATUS_AR: Record<string, string> = {
  PENDING: "معلق",
  ACCEPTED: "مقبول",
  ARRIVED: "وصل",
  EN_ROUTE_TO_CUSTOMER: "في الطريق",
  STARTED: "بدأت الرحلة",
  STUCK: "متعثر",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى"
};

function statusBorderClass(status: string): string {
  switch (status) {
    case "PENDING":
      return "order-room-card--pending";
    case "STUCK":
      return "order-room-card--stuck";
    case "COMPLETED":
      return "order-room-card--completed";
    case "CANCELLED":
      return "order-room-card--cancelled";
    default:
      return "order-room-card--active";
  }
}

function formatMoney(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return `${new Intl.NumberFormat("ar-SY", { maximumFractionDigits: 0 }).format(n)} ل.س`;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function PendingTimer({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const createdMs = useMemo(() => new Date(createdAt).getTime(), [createdAt]);
  const elapsed = now - createdMs;
  const delayed = elapsed >= ORDERS_ROOM_DELAY_MS;

  return (
    <span className={`order-room-card__timer${delayed ? " order-room-card__timer--late" : ""}`}>
      {delayed ? "تأخير · " : "منذ "}
      {formatElapsed(elapsed)}
    </span>
  );
}

export type OrderRoomCardActions = {
  onEditDetails: (order: AdminOrderRoomRow) => void;
  onEditAmount: (order: AdminOrderRoomRow) => void;
  onDelete: (order: AdminOrderRoomRow) => void;
  onCancel: (order: AdminOrderRoomRow) => void;
  onResume: (order: AdminOrderRoomRow) => void;
};

export function OrderRoomCard({
  order,
  actionLoadingId,
  actions
}: {
  order: AdminOrderRoomRow;
  actionLoadingId?: string | null;
  actions?: OrderRoomCardActions;
}) {
  const driverName = order.driver?.user.fullName?.trim() || "غير معيّن";
  const statusLabel = STATUS_AR[order.status] ?? order.status;
  const busy = actionLoadingId === order.id;
  const status = order.status;
  const showActions = Boolean(actions) && status !== "CANCELLED";
  const isStuck = status === "STUCK";
  const isPending = status === "PENDING";
  const canEditDetails = isStuck || isPending;
  const canCancel = isStuck || isPending;
  const canResume = isStuck;

  return (
    <article className={`order-room-card ${statusBorderClass(order.status)}`}>
      <header className="order-room-card__head">
        <span className="order-room-card__status">{statusLabel}</span>
        {order.status === "PENDING" ? <PendingTimer createdAt={order.createdAt} /> : null}
      </header>

      <h3 className="order-room-card__customer">{order.customerName}</h3>

      <div className="order-room-card__route">
        <p>
          <span className="order-room-card__routeLabel">من</span>
          {order.pickupAddress}
        </p>
        <p>
          <span className="order-room-card__routeLabel">إلى</span>
          {order.dropoffAddress}
        </p>
      </div>

      <footer className="order-room-card__meta">
        <span>{formatMoney(order.amount)}</span>
        <span className="order-room-card__driver">السائق: {driverName}</span>
        <span className="order-room-card__coordinator">المنسق: {order.coordinatorName}</span>
      </footer>

      {showActions && actions ? (
        <div className="order-room-card__actions">
          {canEditDetails ? (
            <button
              type="button"
              className="order-room-card__iconBtn"
              title="تعديل التفاصيل"
              aria-label="تعديل التفاصيل"
              disabled={busy}
              onClick={() => actions.onEditDetails(order)}
            >
              <Pencil size={16} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            className="order-room-card__iconBtn"
            title="تعديل الأجرة"
            aria-label="تعديل الأجرة"
            disabled={busy}
            onClick={() => actions.onEditAmount(order)}
          >
            <Banknote size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="order-room-card__iconBtn order-room-card__iconBtn--danger"
            title="حذف"
            aria-label="حذف"
            disabled={busy}
            onClick={() => actions.onDelete(order)}
          >
            <Trash2 size={16} aria-hidden />
          </button>
          {canCancel ? (
            <button
              type="button"
              className="order-room-card__softBtn order-room-card__softBtn--danger"
              disabled={busy}
              onClick={() => actions.onCancel(order)}
            >
              إلغاء
            </button>
          ) : null}
          {canResume ? (
            <button
              type="button"
              className="order-room-card__softBtn order-room-card__softBtn--primary"
              disabled={busy}
              onClick={() => actions.onResume(order)}
            >
              {busy ? "جارٍ..." : "إعادة للسائق"}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
