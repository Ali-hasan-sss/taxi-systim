import { useLocalSearchParams, useRouter } from "expo-router";
import { ChatThreadView } from "../../src/components/ChatThreadView";

function paramText(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function ChatRoomScreen() {
  const { roomId, title, subtitle, roomType } = useLocalSearchParams<{
    roomId: string;
    title?: string;
    subtitle?: string;
    roomType?: string;
  }>();
  const router = useRouter();
  if (!roomId) return null;
  const titleText = paramText(title);
  const subtitleText = paramText(subtitle);
  const typeText = paramText(roomType);
  const canArchive = typeText === "ORDER" || (!typeText && !!subtitleText);
  return (
    <ChatThreadView
      roomId={roomId}
      title={titleText ? decodeURIComponent(titleText) : "محادثة"}
      subtitle={subtitleText ? decodeURIComponent(subtitleText) : null}
      canArchive={canArchive}
      onBack={() => router.back()}
    />
  );
}
