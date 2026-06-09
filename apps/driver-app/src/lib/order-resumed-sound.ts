import { playBundledAlertSound } from "./alert-sound";

const SOURCE = require("../../assets/sounds/driver-order-resumed.wav");

/** تنبيه عند إعادة طلب متعثر للسائق (من المنسق) — حالة EN_ROUTE_TO_CUSTOMER عبر السوكيت. */
export function playOrderResumedSound(): Promise<void> {
  return playBundledAlertSound(SOURCE);
}
