import { Audio } from "expo-av";

let cached: Audio.Sound | null = null;

/**
 * تنبيه صوتي قصير عند ورود طلب معلّق جديد (يُشغَّل من السوكيت).
 * يعمل مع وضع الصامت على iOS عند تفعيل playsInSilentModeIOS.
 */
export async function playNewPendingOrderSound(): Promise<void> {
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
        require("../../assets/sounds/driver-new-order.wav"),
        { shouldPlay: false }
      );
      cached = sound;
    }
    await cached.setPositionAsync(0);
    await cached.playAsync();
  } catch {
    // تجاهل فشل الصوت حتى لا يعطّل تدفق الطلبات
  }
}
