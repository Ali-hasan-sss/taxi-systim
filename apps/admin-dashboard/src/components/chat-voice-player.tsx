"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./chat-voice-player.module.css";

const BAR_COUNT = 32;
const PLAY_EVENT = "taxi-chat-voice-play";

function formatDuration(seconds: number): string {
  const totalSec = Math.max(0, Math.floor(seconds));
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

type Props = {
  src: string;
  durationMs: number | null;
  mine?: boolean;
};

export function ChatVoicePlayer({ src, durationMs, mine = false }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLButtonElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(Math.max(0, (durationMs ?? 0) / 1000));
  const bars = useMemo(() => waveformBars(src, BAR_COUNT), [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrent(audio.currentTime || 0);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      audio.currentTime = 0;
      setCurrent(0);
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => {
      setPlaying(true);
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: src }));
    };
    const onForeignPlay = (event: Event) => {
      const other = (event as CustomEvent<string>).detail;
      if (other !== src && !audio.paused) audio.pause();
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    window.addEventListener(PLAY_EVENT, onForeignPlay);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      window.removeEventListener(PLAY_EVENT, onForeignPlay);
    };
  }, [src]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };

  const seekFromClientX = (clientX: number) => {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (!audio || !track || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const rtl = getComputedStyle(track).direction === "rtl";
    const x = clientX - rect.left;
    const ratio = rtl ? 1 - x / rect.width : x / rect.width;
    const next = Math.min(duration, Math.max(0, ratio * duration));
    audio.currentTime = next;
    setCurrent(next);
  };

  const progress = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0;
  const timeLabel = playing || current > 0.05 ? formatDuration(current) : formatDuration(duration);

  return (
    <div className={`${styles.card} ${mine ? styles.cardMine : styles.cardOther}`}>
      <button
        type="button"
        className={styles.playBtn}
        onClick={() => void togglePlay()}
        aria-label={playing ? "إيقاف الرسالة الصوتية" : "تشغيل الرسالة الصوتية"}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <button
        type="button"
        ref={trackRef}
        className={styles.track}
        aria-label="مسار التشغيل"
        onClick={(e) => seekFromClientX(e.clientX)}
      >
        <span className={styles.bars} aria-hidden>
          {bars.map((height, index) => {
            const filled = index / bars.length <= progress;
            return (
              <span
                key={index}
                className={`${styles.bar} ${filled ? styles.barFilled : ""}`}
                style={{ height: `${Math.round(height * 100)}%` }}
              />
            );
          })}
        </span>
      </button>
      <span className={styles.time}>{timeLabel}</span>
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}
