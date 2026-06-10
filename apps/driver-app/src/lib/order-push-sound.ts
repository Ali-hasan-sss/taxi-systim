import { playNewPendingOrderSound } from "./pending-order-sound";
import { playOrderResumedSound } from "./order-resumed-sound";

export type DriverOrderPushType = "NEW_ORDER" | "ORDER_ASSIGNED" | "ORDER_RESUMED";

export async function playDriverOrderPushSound(type: string | undefined): Promise<void> {
  switch (type) {
    case "NEW_ORDER":
    case "ORDER_ASSIGNED":
      await playNewPendingOrderSound();
      break;
    case "ORDER_RESUMED":
      await playOrderResumedSound();
      break;
    default:
      break;
  }
}
