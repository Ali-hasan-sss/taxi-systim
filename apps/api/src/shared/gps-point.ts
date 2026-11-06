/** فوق هذا الخطأ تُرفض النقطة: مواقع الشبكة وVPN تأتي عادة بدقة مئات الأمتار أو أكثر. */
export const GPS_MAX_ACCURACY_METERS = 150;
/** نفس الحد لمسار الأجرة. 50 متراً كانت تُسقط إشارة السيارة داخل المدينة فتبقى المسافة 0. */
export const TRIP_MAX_ACCURACY_METERS = 150;
const MAX_SPEED_MPS = 45;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earth = 6_371_000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isUsableGps(lat: number, lng: number, accuracy: number | null | undefined, maxAccuracy = GPS_MAX_ACCURACY_METERS): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (accuracy == null || !Number.isFinite(accuracy)) return true;
  if (accuracy <= 0 || accuracy > maxAccuracy) return false;
  return true;
}

/** قفزة أسرع من حركة سيارة حقيقية، مثل انتقال موقع الشبكة مع VPN. */
export function isTeleport(
  previous: { lat: number; lng: number; at: number },
  next: { lat: number; lng: number; at: number }
): boolean {
  const meters = haversineMeters(previous.lat, previous.lng, next.lat, next.lng);
  if (meters < 300) return false;
  const seconds = Math.max(1, (next.at - previous.at) / 1000);
  return meters / seconds > MAX_SPEED_MPS;
}
