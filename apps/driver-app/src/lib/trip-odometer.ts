import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "telegram-trip-odometer";
const MIN_STEP_METERS = 12;
const MAX_SPEED_MPS = 45;
const MAX_TRIP_METERS = 200_000;

type OdometerState = {
  orderId: string;
  meters: number;
  lastLat: number | null;
  lastLng: number | null;
  lastAt: number;
};

let memory: OdometerState | null = null;
let loaded = false;
let chain: Promise<void> = Promise.resolve();

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earth = 6_371_000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as OdometerState;
    if (parsed && typeof parsed.orderId === "string" && Number.isFinite(parsed.meters)) {
      memory = parsed;
    }
  } catch {
    memory = null;
  }
}

function enqueue(task: () => Promise<void>) {
  chain = chain.then(task).catch(() => undefined);
  return chain;
}

async function persist() {
  if (!memory) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
}

/** يبدأ عدّاد المسار من نقطة استلام الزبون. لا يُصفَّر إذا انقطعت الشبكة. */
export function beginTripOdometer(orderId: string, fix?: { lat: number; lng: number } | null) {
  return enqueue(async () => {
    await ensureLoaded();
    memory = {
      orderId,
      meters: 0,
      lastLat: fix?.lat ?? null,
      lastLng: fix?.lng ?? null,
      lastAt: Date.now()
    };
    await persist();
  });
}

/**
 * يضيف قطعة المسار من آخر نقطة GPS صالحة.
 * يعمل بلا شبكة، والقيم تبقى محفوظة حتى تعود.
 */
export function noteTripMovement(orderId: string, lat: number, lng: number, at = Date.now()) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve();
  return enqueue(async () => {
    await ensureLoaded();
    if (!memory || memory.orderId !== orderId) {
      memory = { orderId, meters: 0, lastLat: lat, lastLng: lng, lastAt: at };
      await persist();
      return;
    }
    if (memory.lastLat == null || memory.lastLng == null) {
      memory = { ...memory, lastLat: lat, lastLng: lng, lastAt: at };
      await persist();
      return;
    }
    const meters = haversineMeters(memory.lastLat, memory.lastLng, lat, lng);
    const seconds = Math.max(0, (at - memory.lastAt) / 1000);
    if (meters < MIN_STEP_METERS) return;
    if (seconds >= 2 && meters / seconds > MAX_SPEED_MPS) return;
    memory = {
      orderId,
      meters: Math.min(MAX_TRIP_METERS, memory.meters + meters),
      lastLat: lat,
      lastLng: lng,
      lastAt: at
    };
    await persist();
  });
}

export function readTripMeters(orderId: string): Promise<number> {
  return enqueue(async () => {
    await ensureLoaded();
  }).then(() => (memory?.orderId === orderId ? Math.round(memory.meters) : 0));
}

export function clearTripOdometer(orderId: string) {
  return enqueue(async () => {
    await ensureLoaded();
    if (memory?.orderId !== orderId) return;
    memory = null;
    await persist();
  });
}
