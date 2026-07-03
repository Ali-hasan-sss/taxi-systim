import { playBundledAlertSound } from "./alert-sound";

const SOURCE = require("../../assets/sounds/chat-message.mp3");

export function playChatMessageSound(): Promise<void> {
  return playBundledAlertSound(SOURCE);
}
