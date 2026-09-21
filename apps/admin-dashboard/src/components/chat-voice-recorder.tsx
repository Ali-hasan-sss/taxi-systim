"use client";

import { Mic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./chat-voice-recorder.module.css";

const MIN_VOICE_MS = 600;

type MicPermission = "granted" | "denied" | "prompt" | "unknown";

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function fileFromBlob(blob: Blob): File {
  const mime = blob.type || "audio/webm";
  const ext = mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")
    ? "m4a"
    : mime.includes("mpeg") || mime.includes("mp3")
      ? "mp3"
      : mime.includes("ogg")
        ? "ogg"
        : "webm";
  return new File([blob], `voice.${ext}`, { type: mime });
}

async function queryMicPermission(): Promise<MicPermission> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unknown";
  }
  try {
    const status = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    if (status?.state === "granted" || status?.state === "denied" || status?.state === "prompt") {
      return status.state;
    }
  } catch {
    /* Safari وبعض المتصفحات لا تدعم permissions.query للميكروفون */
  }
  return "unknown";
}

type Props = {
  disabled?: boolean;
  onSend: (file: File, durationMs: number) => Promise<void>;
  onError: (message: string) => void;
  onRecordingChange?: (active: boolean) => void;
};

export function ChatVoiceRecorder({ disabled, onSend, onError, onRecordingChange }: Props) {
  const [askOpen, setAskOpen] = useState(false);
  const [deniedOpen, setDeniedOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const resetRecorder = useCallback(() => {
    clearTick();
    stopTracks();
    recorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = 0;
    setRecording(false);
    setDurationMs(0);
  }, [clearTick, stopTracks]);

  useEffect(() => () => resetRecorder(), [resetRecorder]);

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [onRecordingChange, recording]);

  const startRecording = useCallback(async () => {
    if (disabled || busy || recording) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("التسجيل الصوتي غير مدعوم في هذا المتصفح.");
      return;
    }

    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setDurationMs(0);
      recorder.start(200);
      setRecording(true);
      tickRef.current = setInterval(() => {
        setDurationMs(Date.now() - startedAtRef.current);
      }, 200);
    } catch (error) {
      stopTracks();
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setDeniedOpen(true);
      } else {
        onError("تعذر بدء التسجيل. تحقق من الميكروفون ثم أعد المحاولة.");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, onError, recording, stopTracks]);

  const onMicClick = async () => {
    if (disabled || busy || recording) return;
    const permission = await queryMicPermission();
    if (permission === "granted") {
      await startRecording();
      return;
    }
    if (permission === "denied") {
      setDeniedOpen(true);
      return;
    }
    setAskOpen(true);
  };

  const confirmPermission = async () => {
    setAskOpen(false);
    await startRecording();
  };

  const cancelRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    resetRecorder();
  };

  const sendRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder || busy) return;
    const duration = Math.max(durationMs, Date.now() - startedAtRef.current);
    if (duration < MIN_VOICE_MS) {
      onError("التسجيل قصير جدًا");
      cancelRecording();
      return;
    }

    setBusy(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => reject(new Error("تعذر إيقاف التسجيل"));
        recorder.onstop = () => {
          const type = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
          resolve(new Blob(chunksRef.current, { type }));
        };
        if (recorder.state !== "inactive") recorder.stop();
        else {
          const type = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
          resolve(new Blob(chunksRef.current, { type }));
        }
      });
      stopTracks();
      clearTick();
      if (blob.size < 64) {
        onError("لم يُحفظ التسجيل");
        resetRecorder();
        return;
      }
      await onSend(fileFromBlob(blob), duration);
      resetRecorder();
    } catch (error) {
      resetRecorder();
      onError(error instanceof Error ? error.message : "تعذر إرسال الرسالة الصوتية");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {recording ? (
        <div className={styles.recordingBar} role="status" aria-live="polite">
          <span className={styles.recDot} aria-hidden />
          <span className={styles.recTime}>{formatDuration(durationMs)}</span>
          <span className={styles.recLabel}>جاري التسجيل</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={cancelRecording} disabled={busy}>
            إلغاء
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void sendRecording()} disabled={busy}>
            {busy ? "جاري الإرسال…" : "إرسال"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`btn btn-ghost ${styles.micBtn}`}
          onClick={() => void onMicClick()}
          disabled={disabled || busy}
          aria-label="تسجيل رسالة صوتية"
          title="رسالة صوتية"
        >
          <Mic size={18} aria-hidden />
        </button>
      )}

      {askOpen ? (
        <div className="modal-backdrop" onClick={() => setAskOpen(false)} role="presentation">
          <div
            className={`card modal-panel ${styles.dialog}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mic-permission-title"
          >
            <div className="modal-panel__header">
              <h3 id="mic-permission-title">صلاحية الميكروفون</h3>
            </div>
            <p className={styles.dialogBody}>
              لإرسال رسالة صوتية يحتاج المتصفح إلى صلاحية الميكروفون. اضغط «السماح» ثم وافق على الطلب في نافذة
              المتصفح.
            </p>
            <div className={styles.dialogActions}>
              <button type="button" className="btn btn-ghost" onClick={() => setAskOpen(false)}>
                إلغاء
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void confirmPermission()}>
                السماح
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deniedOpen ? (
        <div className="modal-backdrop" onClick={() => setDeniedOpen(false)} role="presentation">
          <div
            className={`card modal-panel ${styles.dialog}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mic-denied-title"
          >
            <div className="modal-panel__header">
              <h3 id="mic-denied-title">الميكروفون غير مفعّل</h3>
            </div>
            <p className={styles.dialogBody}>
              تم رفض صلاحية الميكروفون. فعّلها من إعدادات المتصفح لهذا الموقع ثم أعد المحاولة.
            </p>
            <div className={styles.dialogActions}>
              <button type="button" className="btn btn-primary" onClick={() => setDeniedOpen(false)}>
                حسناً
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
