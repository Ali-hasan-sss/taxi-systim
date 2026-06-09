import { Audio } from "expo-av";

let cached: Audio.Sound | null = null;

export async function playChatMessageSound(): Promise<void> {
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
        require("../../assets/sounds/chat-message.wav"),
        { shouldPlay: false }
      );
      cached = sound;
    }
    await cached.setPositionAsync(0);
    await cached.playAsync();
  } catch {
    /* ignore */
  }
}
