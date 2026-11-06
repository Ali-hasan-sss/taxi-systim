import { haversineMeters } from "../../shared/gps-point";

const INCLUDED_METERS = 2000;
const STEP_METERS = 100;
const JITTER_METERS = 15;
const MAX_SPEED_MPS = 45;

export function telegramTripFare(distanceMeters: number, baseFare: number, per100m: number): number {
  const distance = Number.isFinite(distanceMeters) && distanceMeters > 0 ? distanceMeters : 0;
  const base = Number.isFinite(baseFare) && baseFare > 0 ? baseFare : 0;
  const stepPrice = Number.isFinite(per100m) && per100m > 0 ? per100m : 0;
  if (distance <= INCLUDED_METERS) return roundMoney(base);
  const steps = Math.ceil((distance - INCLUDED_METERS) / STEP_METERS);
  return roundMoney(base + steps * stepPrice);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function pathDistanceMeters(
  points: Array<{ lat: number; lng: number; recordedAt: Date }>
): number {
  if (points.length < 2) return 0;
  let total = 0;
  let anchor = points[0]!;
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index]!;
    const meters = haversineMeters(anchor.lat, anchor.lng, current.lat, current.lng);
    if (meters < JITTER_METERS) continue;
    const seconds = (current.recordedAt.getTime() - anchor.recordedAt.getTime()) / 1000;
    if (seconds > 1 && meters / seconds > MAX_SPEED_MPS) continue;
    total += meters;
    anchor = current;
  }
  return Math.round(total);
}
