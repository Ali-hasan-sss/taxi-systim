import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import { ChatThreadView } from "../../src/components/ChatThreadView";

function paramText(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
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
  const titleText = paramText(params.title);
  const subtitleText = paramText(params.subtitle);
  const typeText = paramText(params.roomType);
  const canArchive = typeText === "ORDER" || (!typeText && !!subtitleText);
  return (
    <ChatThreadView
      roomId={resolvedRoomId}
      title={titleText ? decodeURIComponent(titleText) : "محادثة"}
      subtitle={subtitleText ? decodeURIComponent(subtitleText) : null}
      roomType={typeText === "GLOBAL" ? "GLOBAL" : "ORDER"}
      canArchive={canArchive}
      onBack={() => router.back()}
    />
  );
}
