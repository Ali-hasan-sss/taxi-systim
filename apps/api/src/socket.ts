import type { Server } from "socket.io";
import { OrderBroadcastTarget } from "@prisma/client";
import { socketEvents } from "@taxi/config";
import { redis, redisEnabled } from "./shared/redis";
import { orderToSocketPayload } from "./modules/orders/orders.service";
import type { Order } from "@prisma/client";

const memOnline = new Map<string, boolean>();
const memLocations = new Map<string, { lat: number; lng: number }>();

export const socketWrite = async (cb: () => Promise<unknown>) => {
  if (!redisEnabled) return;
  try {
    await cb();
  } catch {
    // Redis is optional in local dev mode.
  }
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function isDriverOnline(driverId: string): Promise<boolean> {
  if (memOnline.get(driverId)) return true;
  if (redisEnabled) {
    try {
      const v = await redis.hexists("drivers:online", driverId);
      return v === 1;
    } catch {
      return false;
    }
  }
  return false;
}

/** آخر مواقع السائقين (ذاكرة + Redis عند التوفر) */
export async function getDriverLocationsForNearest(): Promise<Array<{ driverId: string; lat: number; lng: number }>> {
  const merged = new Map<string, { lat: number; lng: number }>();
  for (const [id, loc] of memLocations) {
    merged.set(id, loc);
  }
  if (redisEnabled) {
    try {
      const raw = await redis.hgetall("drivers:locations");
      for (const [driverId, json] of Object.entries(raw)) {
        try {
          const p = JSON.parse(json) as { lat: number; lng: number };
          if (typeof p.lat === "number" && typeof p.lng === "number") {
            merged.set(driverId, { lat: p.lat, lng: p.lng });
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* ignore */
    }
  }
  const out: Array<{ driverId: string; lat: number; lng: number }> = [];
  for (const [driverId, loc] of merged) {
    // eslint-disable-next-line no-await-in-loop
    if (await isDriverOnline(driverId)) {
      out.push({ driverId, ...loc });
    }
  }
  return out;
}

export async function broadcastNewOrder(io: Server, order: Order) {
  const payload = orderToSocketPayload(order);

  if (order.broadcastTarget === OrderBroadcastTarget.ALL) {
    io.emit(socketEvents.NEW_ORDER, payload);
    return;
  }

  const refLat = order.pickupLat;
  const refLng = order.pickupLng;
  if (refLat == null || refLng == null) {
    io.emit(socketEvents.NEW_ORDER, payload);
    return;
  }

  const drivers = await getDriverLocationsForNearest();
  const ranked = drivers
    .map((d) => ({ ...d, dKm: haversineKm(refLat, refLng, d.lat, d.lng) }))
    .sort((a, b) => a.dKm - b.dKm);
  const top = ranked.slice(0, 3);

  if (top.length === 0) {
    io.emit(socketEvents.NEW_ORDER, payload);
    return;
  }

  for (const d of top) {
    io.to(`driver:${d.driverId}`).emit(socketEvents.NEW_ORDER, payload);
  }
}

/** إسناد من المنسق: للسائق المختار + بث عام لتحديث واجهات المنسق */
export function emitOrderAssigned(io: Server, order: Order) {
  const payload = orderToSocketPayload(order);
  if (order.driverId) {
    io.to(`driver:${order.driverId}`).emit(socketEvents.ORDER_ASSIGNED, payload);
  }
  io.emit(socketEvents.ORDER_ASSIGNED, payload);
}

export const initSocket = (io: Server) => {
  io.on("connection", (socket) => {
    socket.on("driver:register", (driverId: string) => {
      if (typeof driverId !== "string" || !driverId) return;
      void socket.join(`driver:${driverId}`);
      void socket.join("drivers");
    });

    socket.on("driver:online", async (driverId: string) => {
      if (typeof driverId === "string" && driverId) memOnline.set(driverId, true);
      await socketWrite(() => redis.hset("drivers:online", driverId, "1"));
      io.emit(socketEvents.DRIVER_ONLINE, { driverId });
    });

    socket.on("driver:location", async (payload: { driverId: string; lat: number; lng: number }) => {
      if (payload?.driverId) {
        memLocations.set(payload.driverId, { lat: payload.lat, lng: payload.lng });
      }
      await socketWrite(() => redis.hset("drivers:locations", payload.driverId, JSON.stringify(payload)));
      io.emit(socketEvents.DRIVER_LOCATION_UPDATED, payload);
    });

    socket.on("driver:offline", async (driverId: string) => {
      if (typeof driverId === "string" && driverId) {
        memOnline.delete(driverId);
        memLocations.delete(driverId);
      }
      await socketWrite(() => redis.hdel("drivers:online", driverId));
      io.emit(socketEvents.DRIVER_OFFLINE, { driverId });
    });
  });
};
