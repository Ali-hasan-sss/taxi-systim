import { chatSocketEvents, socketEvents } from "@taxi/config";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { getSocketOrigin } from "./lib/api";
import type { ChatMessageRow } from "./lib/chat";
import { playChatMessageSound } from "./lib/chat-message-sound";
import { getSession } from "./lib/session";
import { useCoordinatorStore } from "./store";

const ChatSocketContext = createContext<Socket | null>(null);

export function ChatSocketProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;

    void (async () => {
      const session = await getSession();
      if (!session || cancelled) return;

      socket = io(getSocketOrigin(), { transports: ["websocket"] });
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
        store.incrementUnreadChat(msg.roomId);
        void playChatMessageSound();
      };

      socket.on("connect", onConnect);
      socket.on(socketEvents.CHAT_MESSAGE, onMessage);
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
