import { chatSocketEvents, socketEvents } from "@taxi/config";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { io, type Socket } from "socket.io-client";
import { getSocketOrigin } from "./lib/api";
import type { ChatMessageRow } from "./lib/chat";
import { playChatMessageSound } from "./lib/chat-message-sound";
import { getSession } from "./lib/session";
import { useCoordinatorStore } from "./store";

const ChatSocketContext = createContext<Socket | null>(null);

export function ChatSocketProvider({ children }: { children: ReactNode }) {
  const authEpoch = useCoordinatorStore((s) => s.authEpoch);

  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = (delayMs = 2500) => {
      clearReconnectTimer();
      if (cancelled) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delayMs);
    };

    const connect = async () => {
      if (cancelled) return;
      const session = await getSession();
      if (!session || cancelled) return;

      socket?.disconnect();
      socket = io(getSocketOrigin(), { transports: ["websocket", "polling"] });
      const myUserId = session.user.id;

      const onConnect = () => {
        socket?.emit(chatSocketEvents.REGISTER, myUserId);
      };

      const onMessage = (msg: ChatMessageRow) => {
        if (msg.sender.id === myUserId) return;
        socket?.emit(chatSocketEvents.DELIVERED, { messageId: msg.id });
        const store = useCoordinatorStore.getState();
        if (store.activeChatRoomId === msg.roomId) {
          socket?.emit(chatSocketEvents.READ, { roomId: msg.roomId });
          return;
        }
        const counted = store.notifyIncomingChatMessage(msg.roomId, msg.id, {
          senderName: msg.sender.fullName,
          body: msg.body,
          imageUrl: msg.imageUrl,
          hasVoice: !!msg.voiceUrl
        });
        if (counted) void playChatMessageSound();
      };

      socket.on("connect", onConnect);
      socket.on(socketEvents.CHAT_MESSAGE, onMessage);
      socket.on("disconnect", () => {
        if (!cancelled) scheduleReconnect();
      });
      socket.on("connect_error", () => {
        if (!cancelled) scheduleReconnect();
      });
    };

    const onAppStateChange = (next: AppStateStatus) => {
      if (next === "active" && socket && !socket.connected) {
        scheduleReconnect(300);
      }
    };

    void connect();
    const appStateSub = AppState.addEventListener("change", onAppStateChange);

    return () => {
      cancelled = true;
      clearReconnectTimer();
      appStateSub.remove();
      socket?.off("connect");
      socket?.off(socketEvents.CHAT_MESSAGE);
      socket?.off("disconnect");
      socket?.off("connect_error");
      socket?.disconnect();
      socket = null;
    };
  }, [authEpoch]);

  return <ChatSocketContext.Provider value={null}>{children}</ChatSocketContext.Provider>;
}

export function useChatSocket() {
  return useContext(ChatSocketContext);
}
