import { useDriverStore } from "../store";
import { fetchDriverOrderStats } from "./api";
import { feedback } from "./feedback";
import { getDriverLocationAccessState, isDriverLocationReady } from "./location-access";
import { getDriverSession } from "./session";

export const DRIVER_DEBT_BLOCK_FALLBACK =
  "تم إيقافك عن العمل لأن المبلغ المترتب عليك تجاوز 2000 ل.س. سدّد العمولات والغرامات لتعود للعمل تلقائياً.";

export type StartDriverWorkResult = "started" | "blocked" | "need-location" | "failed";

export async function tryStartDriverWork(opts?: { silent?: boolean }): Promise<StartDriverWorkResult> {
  const locationState = await getDriverLocationAccessState();
  if (!isDriverLocationReady(locationState)) {
    useDriverStore.getState().setOnline(false);
    return "need-location";
  }

  const session = await getDriverSession();
  const store = useDriverStore.getState();
  if (session?.accessToken) {
    try {
      const stats = await fetchDriverOrderStats(session.accessToken);
      store.applyDebtWorkState(stats);
      if (stats.workBlocked) {
        if (!opts?.silent) {
          feedback.warning(stats.workBlockMessage ?? DRIVER_DEBT_BLOCK_FALLBACK, "إيقاف عن العمل");
        }
        store.setOnline(false);
        return "blocked";
      }
    } catch {
      if (useDriverStore.getState().workBlocked) {
        if (!opts?.silent) {
          feedback.warning(useDriverStore.getState().workBlockMessage ?? DRIVER_DEBT_BLOCK_FALLBACK, "إيقاف عن العمل");
        }
        useDriverStore.getState().setOnline(false);
        return "blocked";
      }
    }
  } else if (store.workBlocked) {
    if (!opts?.silent) {
      feedback.warning(store.workBlockMessage ?? DRIVER_DEBT_BLOCK_FALLBACK, "إيقاف عن العمل");
    }
    store.setOnline(false);
    return "blocked";
  }

  useDriverStore.getState().setOnline(true);
  return "started";
}
