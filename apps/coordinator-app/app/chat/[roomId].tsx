import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import { ChatThreadView } from "../../src/components/ChatThreadView";

function paramText(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function safeDecode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function ChatRoomScreen() {
  const params = useLocalSearchParams<{
    roomId: string;
    title?: string;
    subtitle?: string;
    roomType?: string;
  }>();
  const router = useRouter();
  const roomId = paramText(params.roomId);
  const stableRoomIdRef = useRef(roomId);
  if (roomId) stableRoomIdRef.current = roomId;
  const resolvedRoomId = roomId ?? stableRoomIdRef.current;
  if (!resolvedRoomId) return null;
  const titleText = safeDecode(paramText(params.title));
  const subtitleText = safeDecode(paramText(params.subtitle));
  const typeText = paramText(params.roomType);
  const canArchive = typeText === "ORDER" || (!typeText && !!subtitleText);

  return (
    <ChatThreadView
      roomId={resolvedRoomId}
      title={titleText || "محادثة"}
      subtitle={subtitleText ?? null}
      roomType={typeText === "GLOBAL" ? "GLOBAL" : "ORDER"}
      canArchive={canArchive}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/chats"))}
    />
  );
}
