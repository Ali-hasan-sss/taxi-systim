import { playBundledAlertSound } from "./alert-sound";

const SOURCE = require("../../assets/sounds/coordinator-order-stuck.wav");

/** تنبيه صوتي عند انتقال طلب إلى حالة متعثرة (STUCK) — يُستدعى من السوكيت. */
export async function playOrderStuckSound(): Promise<void> {
  return playBundledAlertSound(SOURCE);
}
