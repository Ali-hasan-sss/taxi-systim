import * as Location from "expo-location";

/** نرفض ما هو أضعف من هذا حتى لا يحل موقع الشبكة أو الـ VPN مكان GPS. */
export const GPS_MAX_ACCURACY_METERS = 150;

export type GpsFix = { lat: number; lng: number; accuracy: number };

export function gpsFixFromLocation(loc: Location.LocationObject): GpsFix | null {
  if (loc.mocked) return null;
  const lat = loc.coords.latitude;
  const lng = loc.coords.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const accuracy = loc.coords.accuracy;
  if (accuracy != null && Number.isFinite(accuracy) && (accuracy <= 0 || accuracy > GPS_MAX_ACCURACY_METERS)) {
    return null;
  }
  return {
    lat,
    lng,
    accuracy: accuracy != null && Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 1
  };
}

export async function readGpsFix(): Promise<GpsFix | null> {
  for (const accuracy of [Location.Accuracy.BestForNavigation, Location.Accuracy.High]) {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy });
      const fix = gpsFixFromLocation(pos);
      if (fix) return fix;
    } catch {
      /* المحاولة التالية */
    }
  }
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return gpsFixFromLocation(last);
  } catch {
    /* لا يوجد آخر موقع */
  }
  return null;
}
