import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { playChatMessageSound } from "./chat-message-sound";
import { playCoordinatorOrderPushSound } from "./order-push-sound";
import { useCoordinatorStore } from "../store";

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
export function setupCoordinatorOrderPushHandlers(): () => void {
  const bump = () => useCoordinatorStore.getState().bumpOrderRefresh();

  const onReceived = Notifications.addNotificationReceivedListener((n) => {
    const data = n.request.content.data as Record<string, unknown>;
    const type = pushType(data);

    if (type === "CHAT_MESSAGE") {
      const roomId = data.roomId;
      const messageId = data.messageId;
      if (typeof roomId === "string") {
        const senderName = typeof data.senderName === "string" ? data.senderName : "مرسل";
        const body = typeof data.body === "string" ? data.body : null;
        const hasImage = data.hasImage === true;
        const counted = useCoordinatorStore.getState().notifyIncomingChatMessage(
          roomId,
          typeof messageId === "string" ? messageId : `push:${roomId}:${n.request.identifier}`,
          {
            senderName,
            body,
            imageUrl: hasImage ? "push" : null
          }
        );
        if (counted) void playChatMessageSound();
      }
      return;
    }

    if (type === "WEB_ORDER_REQUEST") {
      useCoordinatorStore.getState().incrementWebInquiryCount();
      void playCoordinatorOrderPushSound(type);
      return;
    }

    void playCoordinatorOrderPushSound(type);
    bump();
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

    if (type === "WEB_ORDER_REQUEST") {
      bump();
      router.push("/(tabs)/web-inquiries");
      return;
    }

    bump();
    router.push("/(tabs)/orders");
  });

  return () => {
    onReceived.remove();
    onResponse.remove();
  };
}
