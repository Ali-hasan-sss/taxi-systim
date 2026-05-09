import { Audio } from "expo-av";

let cached: Audio.Sound | null = null;

/** تنبيه صوتي عند انتقال طلب إلى حالة متعثرة (STUCK) — يُستدعى من السوكيت. */
export async function playOrderStuckSound(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false
    });
    if (!cached) {
      const { sound } = await Audio.Sound.createAsync(
        require("../../assets/sounds/coordinator-order-stuck.wav"),
        { shouldPlay: false }
      );
      cached = sound;
    }
    await cached.setPositionAsync(0);
    await cached.playAsync();
  } catch {
    /* تجاهل */
  }
}
