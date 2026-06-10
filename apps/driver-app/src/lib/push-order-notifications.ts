import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { AppState } from "react-native";
import { playChatMessageSound } from "./chat-message-sound";
import { playDriverOrderPushSound } from "./order-push-sound";
import { useDriverStore } from "../store";

function pushType(data: Record<string, unknown> | undefined): string | undefined {
  const t = data?.type;
  return typeof t === "string" ? t : undefined;
}

function chatRoomPath(data: Record<string, unknown>): string | null {
  const roomId = data.roomId;
  if (typeof roomId !== "string") return null;
  const roomTitle = typeof data.roomTitle === "string" ? data.roomTitle : "محادثة";
  const roomType = data.roomType === "ORDER" ? "ORDER" : "GLOBAL";
  const params = new URLSearchParams({ title: roomTitle, roomType });
  return `/chat/${roomId}?${params.toString()}`;
}

/** استقبال إشعارات الطلبات والمحادثات (مقدمة/خلفية) + التنقل عند الضغط */
export function setupDriverOrderPushHandlers(): () => void {
  const onReceived = Notifications.addNotificationReceivedListener((n) => {
    const data = n.request.content.data as Record<string, unknown>;
    const type = pushType(data);

    if (type === "CHAT_MESSAGE") {
      if (AppState.currentState !== "active") {
        const roomId = data.roomId;
        if (typeof roomId === "string") {
          useDriverStore.getState().incrementUnreadChat(roomId);
        }
        void playChatMessageSound();
      }
      return;
    }

    void playDriverOrderPushSound(type);
  });

  const onResponse = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    const type = pushType(data);

    if (type === "CHAT_MESSAGE") {
      const path = chatRoomPath(data);
      if (path) {
        router.push(path as `/chat/${string}`);
        return;
      }
    }

    router.push("/(tabs)/orders");
  });

  return () => {
    onReceived.remove();
    onResponse.remove();
  };
}
