import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { ChatThreadView } from "../../src/components/ChatThreadView";
import { CoordinatorScreenBackground } from "../../src/components/CoordinatorScreenBackground";

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
  const titleText = safeDecode(paramText(params.title));
  const subtitleText = safeDecode(paramText(params.subtitle));
  const typeText = paramText(params.roomType);
  const canArchive = typeText === "ORDER" || (!typeText && !!subtitleText);

  if (!roomId) {
    return (
      <CoordinatorScreenBackground>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      </CoordinatorScreenBackground>
    );
  }

  return (
    <ChatThreadView
      key={roomId}
      roomId={roomId}
      title={titleText || "محادثة"}
      subtitle={subtitleText ?? null}
      roomType={typeText === "GLOBAL" ? "GLOBAL" : "ORDER"}
      canArchive={canArchive}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/chats"))}
    />
  );
}
