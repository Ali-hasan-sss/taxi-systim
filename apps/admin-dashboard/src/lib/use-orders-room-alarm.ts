"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminOrderRoomRow } from "./api";

export const ORDERS_ROOM_DELAY_MS = 90 * 1000;

function hasLatePendingOrders(orders: AdminOrderRoomRow[], now: number): boolean {
  return orders.some((order) => {
    if (order.status !== "PENDING") return false;
    const createdMs = new Date(order.createdAt).getTime();
    if (!Number.isFinite(createdMs)) return false;
    return now - createdMs >= ORDERS_ROOM_DELAY_MS;
  });
}

export function useOrdersRoomAlarm(orders: AdminOrderRoomRow[]) {
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const alarmActive = useMemo(() => hasLatePendingOrders(orders, now), [orders, now]);

  useEffect(() => {
    if (!alarmActive && muted) {
      setMuted(false);
    }
  }, [alarmActive, muted]);

  useEffect(() => {
    if (!alarmActive || muted) {
      stopRef.current?.();
      stopRef.current = null;
      return;
    }

    let cancelled = false;
    let audioContext: AudioContext | null = null;

    const playPulse = () => {
      if (cancelled) return;
      if (!audioContext) {
        audioContext = new AudioContext();
      }
      void audioContext.resume().then(() => {
        if (cancelled || !audioContext) return;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        gain.gain.value = 0.12;
        osc.type = "sine";
        osc.frequency.value = 880;
        osc.connect(gain);
        gain.connect(audioContext.destination);
        const start = audioContext.currentTime;
        osc.start(start);
        osc.stop(start + 0.35);
      });
    };

    playPulse();
    const intervalId = window.setInterval(playPulse, 1400);

    stopRef.current = () => {
      cancelled = true;
      window.clearInterval(intervalId);
      void audioContext?.close();
      audioContext = null;
    };

    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [alarmActive, muted]);

  return {
    alarmActive,
    muted,
    muteAlarm: () => setMuted(true),
    unmuteAlarm: () => setMuted(false)
  };
}
