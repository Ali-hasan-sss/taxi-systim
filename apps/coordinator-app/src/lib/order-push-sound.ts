import { playBundledAlertSound } from "./alert-sound";
import { playOrderStuckSound } from "./order-stuck-sound";

const NEEDS_INFO_SOURCE = require("../../assets/sounds/chat-message.wav");
const NEEDS_INVOICE_SOURCE = require("../../assets/sounds/chat-message.wav");

export type CoordinatorOrderPushType =
  | "ORDER_NEEDS_INFO"
  | "ORDER_ACCEPTED"
  | "ORDER_STUCK"
  | "ORDER_COMPLETED"
  | "ORDER_NEEDS_INVOICE"
  | "WEB_ORDER_REQUEST";

export async function playCoordinatorOrderPushSound(type: string | undefined): Promise<void> {
  switch (type) {
    case "ORDER_STUCK":
      await playOrderStuckSound();
      break;
    case "WEB_ORDER_REQUEST":
    case "ORDER_NEEDS_INFO":
    case "ORDER_ACCEPTED":
      await playBundledAlertSound(NEEDS_INFO_SOURCE);
      break;
    case "ORDER_COMPLETED":
    case "ORDER_NEEDS_INVOICE":
      await playBundledAlertSound(NEEDS_INVOICE_SOURCE);
      break;
    default:
      break;
  }
}
