import { Audio } from "expo-av";

let cached: Audio.Sound | null = null;

/** تنبيه عند إعادة طلب متعثر للسائق (من المنسق) — حالة EN_ROUTE_TO_CUSTOMER عبر السوكيت. */
export async function playOrderResumedSound(): Promise<void> {
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
        require("../../assets/sounds/driver-order-resumed.wav"),
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
