import { playBundledAlertSound } from "./alert-sound";

const SOURCE = require("../../assets/sounds/chat-message.wav");

export async function playChatMessageSound(): Promise<void> {
  return playBundledAlertSound(SOURCE);
}
