import Ionicons from "@expo/vector-icons/Ionicons";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { rtlText } from "../rtl";

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
  const player = useAudioPlayer(localUri, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const [failed, setFailed] = useState(false);

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

  if (failed) {
    return <Text style={{ color: mutedTextColor, ...rtlText }}>[تعذر تشغيل الرسالة الصوتية]</Text>;
  }

  const elapsedMs = Math.round(status.currentTime * 1000);
  const totalMs = totalSeconds > 0 ? Math.round(totalSeconds * 1000) : durationMs ?? 0;
  const timeLabel = playing || hasStarted ? formatDuration(elapsedMs) : formatDuration(totalMs);

  return (
    <Pressable
      onPress={() => void togglePlay()}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minWidth: 180,
        paddingVertical: 4
      }}
      accessibilityRole="button"
      accessibilityLabel={playing ? "إيقاف الرسالة الصوتية" : "تشغيل الرسالة الصوتية"}
    >
      <Ionicons
        name={playing ? "pause-circle" : "play-circle"}
        size={28}
        color={mine ? textColor : accentColor}
      />
      <View
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: mine ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.12)",
          overflow: "hidden"
        }}
      >
        <View
          style={{
            width: `${Math.round(progress * 100)}%`,
            height: 4,
            borderRadius: 2,
            backgroundColor: mine ? textColor : accentColor
          }}
        />
      </View>
      <Text style={{ color: mine ? textColor : mutedTextColor, fontSize: 12, fontWeight: "700", minWidth: 36 }}>
        {timeLabel}
      </Text>
    </Pressable>
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
