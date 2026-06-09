import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

let audioModeReady = false;
const players = new Map<number, AudioPlayer>();

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
    audioModeReady = true;
  } catch {
    /* ignore */
  }
}

/** تشغيل ملف صوتي مضمّن — بدون expo-av (يتجنب خطأ keep awake) */
export async function playBundledAlertSound(source: number): Promise<void> {
  try {
    await ensureAudioMode();
    let player = players.get(source);
    if (!player) {
      player = createAudioPlayer(source);
      players.set(source, player);
    }
    player.seekTo(0);
    player.play();
  } catch {
    /* تجاهل فشل الصوت */
  }
}
