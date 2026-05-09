import type { Server } from "socket.io";
import { OrderBroadcastTarget, OrderVehicleRequirement, VehicleKind, type Order } from "@prisma/client";
import { socketEvents } from "@taxi/config";
import { prisma } from "./shared/prisma";
import { redis, redisEnabled } from "./shared/redis";
import { orderToSocketPayload } from "./modules/orders/order-socket-payload";
import { driverMatchesOrderVehicle, driverWhereMatchesOrderVehicle } from "./modules/orders/order-vehicle-filter";

const memOnline = new Map<string, boolean>();
const memLocations = new Map<string, { lat: number; lng: number }>();

/** سائقون أرسلوا driver:online — طلبات «نوع السيارة: غير مهم» تُبث هنا ليصل الطلب للجميع */
const ROOM_DRIVERS_ONLINE = "drivers-online";
/** طلبات تتطلب سيارة عامة فقط */
const ROOM_ORDER_VEHICLE_PUBLIC = "orders:vehicle:public";
/** طلبات تتطلب سيارة خاصة فقط */
const ROOM_ORDER_VEHICLE_PRIVATE = "orders:vehicle:private";
/** غرفة تطبيقات المنسقين — لاستلام NEW_ORDER دون إرساله لكل السوكيتات */
const ROOM_COORDINATORS = "coordinators";

/** يعمل مع `Socket` المحلي ومع `RemoteSocket` الناتج عن `fetchSockets` */
function syncOrderVehicleRooms(
  socket: { leave: (room: string) => void | Promise<void>; join: (room: string) => void | Promise<void> },
  vehicleKind: VehicleKind | null
) {
  void socket.leave(ROOM_ORDER_VEHICLE_PUBLIC);
  void socket.leave(ROOM_ORDER_VEHICLE_PRIVATE);
  if (vehicleKind === VehicleKind.PUBLIC) void socket.join(ROOM_ORDER_VEHICLE_PUBLIC);
  else if (vehicleKind === VehicleKind.PRIVATE) void socket.join(ROOM_ORDER_VEHICLE_PRIVATE);
}

async function eligibleOnlineDriverDbIdsForOrderVehicle(order: Order): Promise<string[]> {
  const rows = await prisma.driver.findMany({
    where: {
      isOnline: true,
      user: { isActive: true },
      ...driverWhereMatchesOrderVehicle(order.vehicleRequirement)
    },
    select: { id: true }
  });
  return rows.map((r) => r.id);
}

/** منطق استهداف طلب جديد: أقرب 3 متصلين بموقع يطابقون نوع السيارة، أو كل المتصلين المطابقين عند «الجميع» أو عند غياب إحداثيات/مواقع. */
async function collectNewOrderTargetDriverDbIds(order: Order): Promise<string[]> {
  if (order.broadcastTarget === OrderBroadcastTarget.ALL) {
    return eligibleOnlineDriverDbIdsForOrderVehicle(order);
  }

  const refLat = order.pickupLat;
  const refLng = order.pickupLng;
  if (refLat == null || refLng == null) {
    return eligibleOnlineDriverDbIdsForOrderVehicle(order);
  }

  const withLoc = await getDriverLocationsForNearest();
  if (withLoc.length === 0) {
    return eligibleOnlineDriverDbIdsForOrderVehicle(order);
  }

  const kindRows = await prisma.driver.findMany({
    where: { id: { in: withLoc.map((d) => d.driverId) } },
    select: { id: true, vehicleKind: true }
  });
  const kindMap = new Map(kindRows.map((r) => [r.id, r.vehicleKind]));
  const ranked = withLoc
    .map((d) => ({
      driverId: d.driverId,
      dKm: haversineKm(refLat, refLng, d.lat, d.lng),
      vehicleKind: kindMap.get(d.driverId) ?? null
    }))
    .filter((d) => driverMatchesOrderVehicle(order.vehicleRequirement, d.vehicleKind))
    .sort((a, b) => a.dKm - b.dKm);
  const top = ranked.slice(0, 3).map((d) => d.driverId);
  if (top.length === 0) {
    return eligibleOnlineDriverDbIdsForOrderVehicle(order);
  }
  return top;
}

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

/**
 * بعد تعديل نوع السيارة من الأدمن: إعادة إلحاق سوكيتات السائق بغرف `orders:vehicle:*`
 * دون الحاجة لإعادة تشغيل «متصل».
 */
export async function resyncDriverOrderVehicleRooms(io: Server, driverDbId: string): Promise<void> {
  const row = await prisma.driver.findUnique({
    where: { id: driverDbId },
    select: { vehicleKind: true }
  });
  const vehicleKind = row?.vehicleKind ?? null;
  const sockets = await io.in(`driver:${driverDbId}`).fetchSockets();
  for (const s of sockets) {
    syncOrderVehicleRooms(s, vehicleKind);
  }
}

export async function broadcastNewOrder(io: Server, order: Order) {
  const payload = orderToSocketPayload(order);
  io.to(ROOM_COORDINATORS).emit(socketEvents.NEW_ORDER, payload);

  if (order.broadcastTarget === OrderBroadcastTarget.ALL) {
    if (order.vehicleRequirement === OrderVehicleRequirement.ANY) {
      io.to(ROOM_DRIVERS_ONLINE).emit(socketEvents.NEW_ORDER, payload);
      return;
    }
    if (order.vehicleRequirement === OrderVehicleRequirement.PUBLIC) {
      io.to(ROOM_ORDER_VEHICLE_PUBLIC).emit(socketEvents.NEW_ORDER, payload);
      return;
    }
    io.to(ROOM_ORDER_VEHICLE_PRIVATE).emit(socketEvents.NEW_ORDER, payload);
    return;
  }

  const targetIds = await collectNewOrderTargetDriverDbIds(order);
  for (const id of targetIds) {
    io.to(`driver:${id}`).emit(socketEvents.NEW_ORDER, payload);
  }
}

/** نفس منطق استهداف طلب جديد (سوكيت) لإرسال إشعار دفع للسائقين المعنيين */
export async function getPushTargetDriverUserIdsForNewOrder(order: Order): Promise<string[]> {
  const driverIds = await collectNewOrderTargetDriverDbIds(order);
  if (driverIds.length === 0) return [];
  const drivers = await prisma.driver.findMany({
    where: { id: { in: driverIds } },
    select: { userId: true }
  });
  return [...new Set(drivers.map((d) => d.userId))];
}

/** إسناد من المنسق: للسائق المختار + بث عام لتحديث واجهات المنسق */
export function emitOrderAssigned(io: Server, order: Order) {
  const payload = orderToSocketPayload(order);
  if (order.driverId) {
    io.to(`driver:${order.driverId}`).emit(socketEvents.ORDER_ASSIGNED, payload);
  }
  io.emit(socketEvents.ORDER_ASSIGNED, payload);
}

/** بعد قبول سائق لطلب معلق — نفس حمولة الإسناد ليزيل الطلب من قوائم البقية */
export function emitDriverClaimedOrder(io: Server, order: Order) {
  const payload = orderToSocketPayload(order);
  io.emit(socketEvents.ORDER_ASSIGNED, payload);
}

export function emitPendingOrderCancelled(io: Server, orderId: string) {
  io.emit(socketEvents.ORDER_PENDING_CANCELLED, { orderId });
}

export function emitOrderStatusUpdated(io: Server, order: Order) {
  io.emit(socketEvents.ORDER_STATUS_UPDATED, orderToSocketPayload(order));
}

export const initSocket = (io: Server) => {
  io.on("connection", (socket) => {
    socket.on("driver:register", (driverId: string) => {
      if (typeof driverId !== "string" || !driverId) return;
      void socket.join(`driver:${driverId}`);
      void socket.join("drivers");
    });

    socket.on("coordinator:register", (_coordinatorId: string) => {
      void socket.join(ROOM_COORDINATORS);
    });

    socket.on("driver:online", async (driverId: string) => {
      if (typeof driverId !== "string" || !driverId) return;
      memOnline.set(driverId, true);
      void socket.join(ROOM_DRIVERS_ONLINE);
      let vehicleKind: VehicleKind | null = null;
      try {
        const row = await prisma.driver.findUnique({
          where: { id: driverId },
          select: { vehicleKind: true }
        });
        vehicleKind = row?.vehicleKind ?? null;
      } catch {
        /* تجاهل */
      }
      syncOrderVehicleRooms(socket, vehicleKind);
      await socketWrite(() => redis.hset("drivers:online", driverId, "1"));
      try {
        await prisma.driver.update({ where: { id: driverId }, data: { isOnline: true } });
      } catch {
        /* تجاهل */
      }
      io.emit(socketEvents.DRIVER_ONLINE, { driverId });
    });

    socket.on("driver:location", async (payload: { driverId: string; lat: number; lng: number }) => {
      if (payload?.driverId) {
        memLocations.set(payload.driverId, { lat: payload.lat, lng: payload.lng });
      }
      await socketWrite(() => redis.hset("drivers:locations", payload.driverId, JSON.stringify(payload)));
      let isBusy = false;
      try {
        const row = await prisma.driver.findUnique({
          where: { id: payload.driverId },
          select: { isBusy: true }
        });
        isBusy = row?.isBusy ?? false;
      } catch {
        /* تجاهل */
      }
      io.emit(socketEvents.DRIVER_LOCATION_UPDATED, { ...payload, isBusy });
    });

    socket.on("driver:offline", async (driverId: string) => {
      if (typeof driverId === "string" && driverId) {
        memOnline.delete(driverId);
        memLocations.delete(driverId);
      }
      void socket.leave(ROOM_DRIVERS_ONLINE);
      void socket.leave(ROOM_ORDER_VEHICLE_PUBLIC);
      void socket.leave(ROOM_ORDER_VEHICLE_PRIVATE);
      await socketWrite(() => redis.hdel("drivers:online", driverId));
      try {
        if (typeof driverId === "string" && driverId) {
          await prisma.driver.update({ where: { id: driverId }, data: { isOnline: false } });
        }
      } catch {
        /* تجاهل */
      }
      io.emit(socketEvents.DRIVER_OFFLINE, { driverId });
    });
  });
};
