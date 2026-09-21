import Ionicons from "@expo/vector-icons/Ionicons";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, type GestureResponderEvent, Pressable, Text, View } from "react-native";
import { rtlText } from "../rtl";

const BAR_COUNT = 26;

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function waveformBars(seed: string, count: number): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    const n = ((hash >>> 0) % 1000) / 1000;
    const envelope = 0.35 + 0.65 * Math.sin((i / Math.max(1, count - 1)) * Math.PI);
    bars.push(Math.min(1, 0.22 + n * 0.78 * envelope));
  }
  return bars;
}

type ChatVoiceMessagePlayerProps = {
  localUri: string;
  durationMs: number | null;
  mine: boolean;
  accentColor: string;
  textColor: string;
  mutedTextColor: string;
};

function ChatVoiceMessagePlayer({
  localUri,
  durationMs,
  mine,
  accentColor,
  textColor,
  mutedTextColor
}: ChatVoiceMessagePlayerProps) {
  const player = useAudioPlayer(localUri, { updateInterval: 80 });
  const status = useAudioPlayerStatus(player);
  const [failed, setFailed] = useState(false);
  const trackWidthRef = useRef(0);
  const bars = useMemo(() => waveformBars(localUri, BAR_COUNT), [localUri]);

  const totalSeconds =
    status.duration > 0 ? status.duration : Math.max(0, (durationMs ?? 0) / 1000);
  const progress =
    totalSeconds > 0 ? Math.min(1, Math.max(0, status.currentTime / totalSeconds)) : 0;
  const hasStarted = status.currentTime > 0.05 && !status.didJustFinish;
  const playing = status.playing;

  useEffect(() => {
    if (!status.didJustFinish) return;
    try {
      player.pause();
      void player.seekTo(0);
    } catch {
      /* ignore */
    }
  }, [player, status.didJustFinish]);

  const togglePlay = async () => {
    if (failed) return;
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      if (playing) {
        player.pause();
        return;
      }
      if (status.didJustFinish || status.currentTime >= totalSeconds - 0.05) {
        await player.seekTo(0);
      }
      player.play();
    } catch {
      setFailed(true);
      try {
        player.pause();
      } catch {
        /* ignore */
      }
    }
  };

  const seekOnTrack = async (event: GestureResponderEvent) => {
    if (totalSeconds <= 0 || failed) return;
    const width = trackWidthRef.current;
    if (width <= 0) return;
    const x = event.nativeEvent.locationX;
    const ratio = Math.min(1, Math.max(0, x / width));
    try {
      await player.seekTo(ratio * totalSeconds);
      if (!playing) player.play();
    } catch {
      /* ignore */
    }
  };

  if (failed) {
    return <Text style={{ color: mutedTextColor, ...rtlText }}>[تعذر تشغيل الرسالة الصوتية]</Text>;
  }

  const elapsedMs = Math.round(status.currentTime * 1000);
  const totalMs = totalSeconds > 0 ? Math.round(totalSeconds * 1000) : durationMs ?? 0;
  const timeLabel = playing || hasStarted ? formatDuration(elapsedMs) : formatDuration(totalMs);
  const idleBar = mine ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.14)";
  const filledBar = mine ? textColor : accentColor;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minWidth: 196,
        paddingVertical: 2
      }}
    >
      <Pressable
        onPress={() => void togglePlay()}
        accessibilityRole="button"
        accessibilityLabel={playing ? "إيقاف الرسالة الصوتية" : "تشغيل الرسالة الصوتية"}
        hitSlop={6}
      >
        <Ionicons
          name={playing ? "pause-circle" : "play-circle"}
          size={34}
          color={mine ? textColor : accentColor}
        />
      </Pressable>
      <Pressable
        onLayout={(e) => {
          trackWidthRef.current = e.nativeEvent.layout.width;
        }}
        onPress={(e) => void seekOnTrack(e)}
        style={{
          flex: 1,
          height: 32,
          flexDirection: "row",
          alignItems: "center",
          gap: 2
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="مسار التشغيل"
      >
        {bars.map((height, index) => {
          const filled = index / bars.length <= progress;
          return (
            <View
              key={index}
              style={{
                flex: 1,
                height: Math.max(6, Math.round(height * 28)),
                borderRadius: 99,
                backgroundColor: filled ? filledBar : idleBar
              }}
            />
          );
        })}
      </Pressable>
      <Text
        style={{
          color: mine ? textColor : mutedTextColor,
          fontSize: 12,
          fontWeight: "700",
          minWidth: 36
        }}
      >
        {timeLabel}
      </Text>
    </View>
  );
}

export type ChatVoiceMessageProps = {
  voiceUrl: string;
  token: string;
  durationMs: number | null;
  expired: boolean;
  mine: boolean;
  accentColor: string;
  textColor: string;
  mutedTextColor: string;
  resolveUri: (voiceUrl: string, token: string) => Promise<string | null>;
};

export function ChatVoiceMessage({
  voiceUrl,
  token,
  durationMs,
  expired,
  mine,
  accentColor,
  textColor,
  mutedTextColor,
  resolveUri
}: ChatVoiceMessageProps) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setLocalUri(null);
    void resolveUri(voiceUrl, token).then((uri) => {
      if (cancelled) return;
      if (uri) setLocalUri(uri);
      else setFailed(true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [resolveUri, token, voiceUrl]);

  if (expired) {
    return <Text style={{ color: mutedTextColor, ...rtlText }}>[انتهت صلاحية الرسالة الصوتية]</Text>;
  }

  if (loading) {
    return (
      <View style={{ minWidth: 160, paddingVertical: 6, alignItems: "center" }}>
        <ActivityIndicator color={mine ? textColor : accentColor} />
      </View>
    );
  }

  if (failed || !localUri) {
    return <Text style={{ color: mutedTextColor, ...rtlText }}>[تعذر تحميل الرسالة الصوتية]</Text>;
  }

  return (
    <ChatVoiceMessagePlayer
      localUri={localUri}
      durationMs={durationMs}
      mine={mine}
      accentColor={accentColor}
      textColor={textColor}
      mutedTextColor={mutedTextColor}
    />
  );
}
