import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { socketEvents } from "@taxi/config";
import { coordinatorMe, getSocketOrigin, listWebInquiries } from "./api";
import { playCoordinatorOrderPushSound } from "./order-push-sound";
import { getSession } from "./session";
import { useCoordinatorStore } from "../store";

export function useWebInquiryRealtime(enabled = true) {
  const setWebInquiryCount = useCoordinatorStore((s) => s.setWebInquiryCount);
  const incrementWebInquiryCount = useCoordinatorStore((s) => s.incrementWebInquiryCount);

  useEffect(() => {
    if (!enabled) return;
    let socket: Socket | null = null;
    let cancelled = false;

    const syncCount = async () => {
      const session = await getSession();
      if (!session?.accessToken || cancelled) return;
      try {
        const rows = await listWebInquiries(session.accessToken);
        if (!cancelled) setWebInquiryCount(rows.length);
      } catch {
        /* ignore */
      }
    };

    const connect = async () => {
      const session = await getSession();
      if (!session?.accessToken || cancelled) return;
      await syncCount();
      const me = await coordinatorMe(session.accessToken);
      if (!me.coordinatorId || cancelled) return;

      socket = io(getSocketOrigin(), { transports: ["websocket", "polling"] });
      socket.on("connect", () => {
        socket?.emit("coordinator:register", me.coordinatorId);
      });
      socket.on(socketEvents.WEB_ORDER_REQUEST, () => {
        incrementWebInquiryCount();
        void playCoordinatorOrderPushSound("WEB_ORDER_REQUEST");
      });
    };

    void connect();
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [enabled, incrementWebInquiryCount, setWebInquiryCount]);
}
