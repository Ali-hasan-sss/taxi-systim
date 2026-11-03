import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { useChatSocket } from "../chat-socket-context";

const EVENT = "order:draft-typing";

const sources = new Map<number, boolean>();
let nextId = 0;
let sharedSocket: Socket | null = null;

function publish() {
  const typing = [...sources.values()].some(Boolean);
  sharedSocket?.emit(EVENT, { active: typing });
}

/** يخبر السائقين أن منسقًا يكتب طلبًا الآن، ويتوقف عند إغلاق النموذج أو مسح الحقول. */
export function useOrderDraftSignal(active: boolean) {
  const socket = useChatSocket();
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = ++nextId;

  useEffect(() => {
    const id = idRef.current;
    sources.set(id, active);
    publish();
    return () => {
      sources.delete(id);
      publish();
    };
  }, [active]);

  useEffect(() => {
    if (!socket) return;
    sharedSocket = socket;
    const refresh = setInterval(publish, 5000);
    socket.on("connect", publish);
    publish();
    return () => {
      clearInterval(refresh);
      socket.off("connect", publish);
      if (sharedSocket === socket) publish();
    };
  }, [socket]);
}
