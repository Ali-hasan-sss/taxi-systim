import { OrderSource, OrderStatus } from "@prisma/client";
import { haversineMeters, isTeleport, isUsableGps, TRIP_MAX_ACCURACY_METERS } from "../../shared/gps-point";
import { prisma } from "../../shared/prisma";
import { pathDistanceMeters } from "./telegram-fare";

const MIN_MOVE_METERS = 15;

type CacheEntry = {
  orderId: string | null;
  expiresAt: number;
  lastLat?: number;
  lastLng?: number;
  lastAt?: number;
};

const activeTrips = new Map<string, CacheEntry>();

async function startedTelegramOrderId(driverId: string): Promise<string | null> {
  const cached = activeTrips.get(driverId);
  if (cached && cached.expiresAt > Date.now()) return cached.orderId;
  const order = await prisma.order.findFirst({
    where: { driverId, status: OrderStatus.STARTED, source: OrderSource.TELEGRAM },
    select: { id: true }
  });
  const entry: CacheEntry = {
    orderId: order?.id ?? null,
    expiresAt: Date.now() + 20_000,
    lastLat: cached?.lastLat,
    lastLng: cached?.lastLng,
    lastAt: cached?.lastAt
  };
  activeTrips.set(driverId, entry);
  return entry.orderId;
}

export function rememberTelegramTrip(driverId: string, orderId: string | null) {
  if (!orderId) {
    activeTrips.delete(driverId);
    return;
  }
  const previous = activeTrips.get(driverId);
  activeTrips.set(driverId, {
    orderId,
    expiresAt: Date.now() + 60_000,
    lastLat: previous?.lastLat,
    lastLng: previous?.lastLng,
    lastAt: previous?.lastAt
  });
}

export async function recordTelegramTripPoint(
  driverId: string,
  lat: number,
  lng: number,
  options?: { orderId?: string; force?: boolean; accuracy?: number | null }
): Promise<void> {
  if (!isUsableGps(lat, lng, options?.accuracy, TRIP_MAX_ACCURACY_METERS)) return;
  const orderId = options?.orderId ?? (await startedTelegramOrderId(driverId));
  if (!orderId) return;
  const now = Date.now();
  const cached = activeTrips.get(driverId);
  if (cached?.lastLat != null && cached.lastLng != null && cached.lastAt != null) {
    const previous = { lat: cached.lastLat, lng: cached.lastLng, at: cached.lastAt };
    if (isTeleport(previous, { lat, lng, at: now })) return;
    if (!options?.force && haversineMeters(cached.lastLat, cached.lastLng, lat, lng) < MIN_MOVE_METERS) return;
  }
  await prisma.driverLocationHistory.create({
    data: { driverId, orderId, lat, lng }
  });
  activeTrips.set(driverId, {
    orderId,
    expiresAt: Date.now() + 60_000,
    lastLat: lat,
    lastLng: lng,
    lastAt: now
  });
}

export async function measureTelegramTripMeters(orderId: string): Promise<number> {
  const points = await prisma.driverLocationHistory.findMany({
    where: { orderId },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
    select: { lat: true, lng: true, recordedAt: true }
  });
  return pathDistanceMeters(points);
}
