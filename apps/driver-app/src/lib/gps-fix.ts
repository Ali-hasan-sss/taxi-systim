import * as Location from "expo-location";

/** نرفض ما هو أضعف من هذا حتى لا يحل موقع الشبكة أو الـ VPN مكان GPS. */
export const GPS_MAX_ACCURACY_METERS = 80;

export type GpsFix = { lat: number; lng: number; accuracy: number };

export function gpsFixFromLocation(loc: Location.LocationObject): GpsFix | null {
  if (loc.mocked) return null;
  const accuracy = loc.coords.accuracy;
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > GPS_MAX_ACCURACY_METERS) {
    return null;
  }
  const lat = loc.coords.latitude;
  const lng = loc.coords.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, accuracy };
}

export async function readGpsFix(): Promise<GpsFix | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation
    });
    return gpsFixFromLocation(pos);
  } catch {
    return null;
  }
}
