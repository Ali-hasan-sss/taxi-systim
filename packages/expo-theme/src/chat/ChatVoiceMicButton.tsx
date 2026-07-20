import Ionicons from "@expo/vector-icons/Ionicons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import { rtlText } from "../rtl";

const MIN_VOICE_MS = 600;
const CANCEL_DRAG_PX = 72;

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type ChatVoiceMicButtonProps = {
  disabled?: boolean;
  accentColor: string;
  textColor: string;
  overlayTextColor: string;
  dangerColor: string;
  onSend: (uri: string, durationMs: number) => void | Promise<void>;
  onError: (message: string) => void;
};

export function ChatVoiceMicButton({
  disabled,
  accentColor,
  textColor,
  overlayTextColor,
  dangerColor,
  onSend,
  onError
}: ChatVoiceMicButtonProps) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: "document"
  });
  const [active, setActive] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [permissionReady, setPermissionReady] = useState(false);
  const recorderState = useAudioRecorderState(recorder, active ? 200 : 2000);
  const cancellingRef = useRef(false);
  const activeRef = useRef(false);
  const finishingRef = useRef(false);
  const sendingRef = useRef(false);
  const onSendRef = useRef(onSend);
  const onErrorRef = useRef(onError);

  onSendRef.current = onSend;
  onErrorRef.current = onError;
  activeRef.current = active;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (cancelled) return;
        if (!status.granted) {
          onErrorRef.current("يجب السماح بالوصول للميكروفون");
          return;
        }
        setPermissionReady(true);
      } catch {
        if (!cancelled) onErrorRef.current("تعذر تجهيز الميكروفون");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finishRecording = useCallback(
    async (cancelled: boolean) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setActive(false);
      setCancelling(false);
      cancellingRef.current = false;

      try {
        if (!recorderState.isRecording) return;

        const durationMs = recorderState.durationMillis ?? 0;
        await recorder.stop();

        if (cancelled) return;
        if (durationMs < MIN_VOICE_MS) {
          onErrorRef.current("التسجيل قصير جدًا");
          return;
        }
        const uri = recorder.uri;
        if (!uri) {
          onErrorRef.current("لم يُحفظ التسجيل");
          return;
        }

        sendingRef.current = true;
        try {
          await onSendRef.current(uri, durationMs);
        } finally {
          sendingRef.current = false;
        }
      } catch {
        onErrorRef.current("تعذر إيقاف التسجيل");
      } finally {
        finishingRef.current = false;
      }
    },
    [recorder, recorderState.durationMillis, recorderState.isRecording]
  );

  const startRecording = useCallback(async () => {
    if (!permissionReady || disabled || sendingRef.current || finishingRef.current) return;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      cancellingRef.current = false;
      setCancelling(false);
      setActive(true);
    } catch {
      onErrorRef.current("تعذر بدء التسجيل");
      setActive(false);
    }
  }, [disabled, permissionReady, recorder]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => activeRef.current,
      onPanResponderMove: (_evt, gesture) => {
        const cancel = gesture.dx < -CANCEL_DRAG_PX;
        cancellingRef.current = cancel;
        setCancelling(cancel);
      },
      onPanResponderTerminationRequest: () => true
    })
  ).current;

  return (
    <>
      {active ? (
        <View
          {...panResponder.panHandlers}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
            zIndex: 20,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "flex-end",
            paddingHorizontal: 16,
            paddingBottom: 24
          }}
        >
          <View
            style={{
              backgroundColor: cancelling ? dangerColor : accentColor,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <Text style={{ color: overlayTextColor, fontSize: 14, fontWeight: "700", ...rtlText }}>
              {cancelling ? "أفلت للإلغاء" : "اسحب لليسار للإلغاء"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="mic" size={18} color={overlayTextColor} />
              <Text style={{ color: overlayTextColor, fontSize: 16, fontWeight: "800" }}>
                {formatDuration(recorderState.durationMillis ?? 0)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <Pressable
        style={{ padding: 8, opacity: disabled || !permissionReady ? 0.45 : 1 }}
        disabled={disabled || !permissionReady}
        onPressIn={() => {
          void startRecording();
        }}
        onPressOut={() => {
          if (!activeRef.current) return;
          void finishRecording(cancellingRef.current);
        }}
        accessibilityLabel="تسجيل رسالة صوتية"
        accessibilityRole="button"
      >
        <Ionicons name="mic-outline" size={22} color={textColor} />
      </Pressable>
    </>
  );
}
