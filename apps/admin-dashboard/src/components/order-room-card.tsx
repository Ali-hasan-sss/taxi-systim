"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminOrderRoomRow } from "../lib/api";

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

const PENDING_DELAY_MS = 5 * 60 * 1000;

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
  const delayed = elapsed >= PENDING_DELAY_MS;

  return (
    <span className={`order-room-card__timer${delayed ? " order-room-card__timer--late" : ""}`}>
      {delayed ? "تأخير · " : "منذ "}
      {formatElapsed(elapsed)}
    </span>
  );
}

export function OrderRoomCard({ order }: { order: AdminOrderRoomRow }) {
  const driverName = order.driver?.user.fullName?.trim() || "غير معيّن";
  const statusLabel = STATUS_AR[order.status] ?? order.status;

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
    </article>
  );
}
