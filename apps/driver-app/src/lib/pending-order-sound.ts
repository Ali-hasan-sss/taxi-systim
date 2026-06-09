import { playBundledAlertSound } from "./alert-sound";

const SOURCE = require("../../assets/sounds/driver-new-order.wav");

/**
 * تنبيه صوتي قصير عند ورود طلب معلّق جديد (يُشغَّل من السوكيت).
 */
export function playNewPendingOrderSound(): Promise<void> {
  return playBundledAlertSound(SOURCE);
}
