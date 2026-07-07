import { useNetworkOffline, useThemedStyles } from "@taxi/expo-theme";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chatRoomHref, chatRoomHrefFallback, listChatRooms } from "../lib/chat";
import { rtlText } from "../lib/rtl-text";
import { useCoordinatorStore } from "../store";

function previewText(body: string | null, imageUrl: string | null, hasVoice?: boolean): string {
  const text = body?.trim();
  if (text) return text.length > 90 ? `${text.slice(0, 87)}…` : text;
  if (hasVoice) return "رسالة صوتية";
  if (imageUrl) return "أرسل صورة";
  return "رسالة جديدة";
}

export function ChatIncomingToastHost() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offline = useNetworkOffline();
  const toast = useCoordinatorStore((s) => s.pendingChatToast);
  const activeChatRoomId = useCoordinatorStore((s) => s.activeChatRoomId);
  const clearChatToast = useCoordinatorStore((s) => s.clearChatToast);

  const styles = useThemedStyles((t) => ({
    root: {
      position: "absolute" as const,
      left: 12,
      right: 12,
      zIndex: 10001,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.colors.borderStrong,
      backgroundColor: t.colors.surfaceCard,
      paddingHorizontal: 14,
      paddingVertical: 12,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 8
    },
    sender: {
      color: t.colors.text,
      fontSize: 15,
      fontWeight: "800" as const,
      ...rtlText
    },
    body: {
      marginTop: 4,
      color: t.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      ...rtlText
    },
    actions: {
      marginTop: 10,
      flexDirection: "row" as const,
      justifyContent: "flex-end" as const,
      gap: 8
    },
    btn: {
      minWidth: 72,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: "center" as const
    },
    btnDismiss: {
      backgroundColor: t.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: t.colors.border
    },
    btnOpen: {
      backgroundColor: t.colors.accent
    },
    btnDismissText: {
      color: t.colors.textSecondary,
      fontSize: 13,
      fontWeight: "700" as const,
      ...rtlText
    },
    btnOpenText: {
      color: t.colors.textInverse,
      fontSize: 13,
      fontWeight: "800" as const,
      ...rtlText
    }
  }));

  useEffect(() => {
    if (toast && activeChatRoomId === toast.roomId) {
      clearChatToast();
    }
  }, [activeChatRoomId, toast, clearChatToast]);

  if (!toast) return null;

  const topOffset = insets.top + (offline ? 34 : 8);

  const openChat = () => {
    const { roomId, senderName } = toast;
    clearChatToast();
    void (async () => {
      try {
        const rooms = await listChatRooms();
        const room = rooms.find((row) => row.id === roomId);
        if (room) {
          router.push(chatRoomHref(room) as `/chat/${string}`);
          return;
        }
      } catch {
        /* fallback */
      }
      router.push(chatRoomHrefFallback(roomId, senderName, "ORDER") as `/chat/${string}`);
    })();
  };

  return (
    <View style={[styles.root, { top: topOffset }]} accessibilityLiveRegion="polite">
      <Text style={styles.sender} numberOfLines={1}>
        {toast.senderName}
      </Text>
      <Text style={styles.body} numberOfLines={2}>
        {previewText(toast.body, toast.imageUrl, toast.hasVoice)}
      </Text>
      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, styles.btnDismiss]}
          onPress={clearChatToast}
          accessibilityRole="button"
          accessibilityLabel="تجاهل"
        >
          <Text style={styles.btnDismissText}>تجاهل</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnOpen]}
          onPress={openChat}
          accessibilityRole="button"
          accessibilityLabel="فتح المحادثة"
        >
          <Text style={styles.btnOpenText}>فتح</Text>
        </Pressable>
      </View>
    </View>
  );
}
