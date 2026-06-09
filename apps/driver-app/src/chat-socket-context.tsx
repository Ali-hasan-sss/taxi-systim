import { chatSocketEvents, socketEvents } from "@taxi/config";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { getSocketOrigin } from "./lib/api";
import type { ChatMessageRow } from "./lib/chat";
import { playChatMessageSound } from "./lib/chat-message-sound";
import { getDriverSession } from "./lib/session";
import { useDriverStore } from "./store";

const CHAT_SOCKET = {
  REGISTER: chatSocketEvents.REGISTER,
  MESSAGE: socketEvents.CHAT_MESSAGE
} as const;

const ChatSocketContext = createContext<Socket | null>(null);

export function ChatSocketProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;

    void (async () => {
      const session = await getDriverSession();
      if (!session || cancelled) return;

      socket = io(getSocketOrigin(), { transports: ["websocket"] });
      const myUserId = session.user.id;

      const onConnect = () => {
        socket?.emit(CHAT_SOCKET.REGISTER, myUserId);
      };

      const onMessage = (msg: ChatMessageRow) => {
        if (msg.sender.id === myUserId) return;
        socket?.emit(chatSocketEvents.DELIVERED, { messageId: msg.id });
        const store = useDriverStore.getState();
        if (store.activeChatRoomId === msg.roomId) {
          socket?.emit(chatSocketEvents.READ, { roomId: msg.roomId });
          return;
        }
        store.incrementUnreadChat(msg.roomId);
        void playChatMessageSound();
      };

      socket.on("connect", onConnect);
      socket.on(CHAT_SOCKET.MESSAGE, onMessage);
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, []);

  return <ChatSocketContext.Provider value={null}>{children}</ChatSocketContext.Provider>;
}

export function useChatSocket() {
  return useContext(ChatSocketContext);
}
