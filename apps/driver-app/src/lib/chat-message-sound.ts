import { playBundledAlertSound } from "./alert-sound";

const SOURCE = require("../../assets/sounds/chat-message.wav");

export function playChatMessageSound(): Promise<void> {
  return playBundledAlertSound(SOURCE);
}
