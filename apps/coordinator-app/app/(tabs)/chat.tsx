import { useTheme, useThemedStyles, ChatPeerAvatar } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { io } from "socket.io-client";
import { chatSocketEvents, socketEvents } from "@taxi/config";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { type ChatRoomRow, archiveChatRoom, chatRoomHref, chatRoomListTitle, listChatRooms } from "../../src/lib/chat";
import { getSocketOrigin } from "../../src/lib/api";
import { getSession } from "../../src/lib/session";
import { coordinatorTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { feedback } from "../../src/lib/feedback";
import { rtlText } from "../../src/lib/rtl-text";
import { useCoordinatorStore } from "../../src/store";

export default function ChatTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [rooms, setRooms] = useState<ChatRoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const unreadByRoom = useCoordinatorStore((s) => s.unreadByRoom);
  const chatPreviewByRoom = useCoordinatorStore((s) => s.chatPreviewByRoom);

  const styles = useThemedStyles((t) => ({
    root: { flex: 1, backgroundColor: t.colors.background, direction: "rtl" as const },
    title: {
      fontSize: 22,
      fontWeight: "800" as const,
      color: t.colors.text,
      paddingHorizontal: 20,
      marginBottom: 8,
      ...rtlText
    },
    subtitle: {
      fontSize: 13,
      color: t.colors.textMuted,
      paddingHorizontal: 20,
      marginBottom: 12,
      ...rtlText
    },
    row: {
      marginHorizontal: 16,
      marginBottom: 10,
      padding: 14,
      borderRadius: 14,
      backgroundColor: t.colors.surfaceCard,
      borderWidth: 1,
      borderColor: t.colors.border,
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      gap: 8
    },
    rowTap: { flex: 1, minWidth: 0 },
    rowInner: { flexDirection: "row-reverse" as const, alignItems: "center" as const, gap: 12 },
    rowBody: { flex: 1, minWidth: 0 },
    rowGlobal: { borderColor: t.colors.primary, borderWidth: 1.5 },
    rowTitle: { fontSize: 16, fontWeight: "800" as const, color: t.colors.text, ...rtlText },
    rowPreview: { marginTop: 6, fontSize: 13, color: t.colors.textMuted, ...rtlText },
    unreadDot: {
      marginTop: 6,
      alignSelf: "flex-start" as const,
      backgroundColor: t.colors.badge,
      color: t.colors.badgeText,
      fontSize: 11,
      fontWeight: "800" as const,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      overflow: "hidden" as const,
      ...rtlText
    },
    rowArchiveBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: t.colors.filterBg
    },
    centered: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const }
  }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listChatRooms();
      setRooms(data);
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر تحميل المحادثات");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const confirmArchive = (room: ChatRoomRow) => {
    if (archivingId || room.type === "GLOBAL") return;
    feedback.confirmArchiveChat(() => {
      setArchivingId(room.id);
      void archiveChatRoom(room.id)
        .then(() => {
          setRooms((prev) => prev.filter((r) => r.id !== room.id));
          feedback.success("تمت أرشفة المحادثة.");
        })
        .catch((e) => {
          feedback.error(e instanceof Error ? e.message : "تعذر الأرشفة");
        })
        .finally(() => setArchivingId(null));
    });
  };

  useEffect(() => {
    let socket: ReturnType<typeof io> | null = null;
    let cancelled = false;
    void (async () => {
      const session = await getSession();
      if (!session || cancelled) return;
      socket = io(getSocketOrigin(), { transports: ["websocket"] });
      socket.on("connect", () => socket?.emit(chatSocketEvents.REGISTER, session.user.id));
      const patchDriver = (driverId: string, online: boolean) => {
        setRooms((prev) =>
          prev.map((r) => (r.peerDriverId === driverId ? { ...r, peerOnline: online } : r))
        );
      };
      socket.on(socketEvents.CHAT_USER_PRESENCE, (p: { userId?: string; online?: boolean }) => {
        if (!p.userId) return;
        setRooms((prev) =>
          prev.map((r) => (r.peerUserId === p.userId ? { ...r, peerOnline: !!p.online } : r))
        );
      });
      socket.on(socketEvents.DRIVER_ONLINE, (p: { driverId?: string }) => {
        if (p.driverId) patchDriver(p.driverId, true);
      });
      socket.on(socketEvents.DRIVER_OFFLINE, (p: { driverId?: string }) => {
        if (p.driverId) patchDriver(p.driverId, false);
      });
    })();
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, []);

  if (loading && rooms.length === 0) {
    return (
      <SafeAreaView style={[styles.root, { paddingTop: 8 }]} edges={["left", "right"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.root, { paddingTop: 8, paddingBottom: coordinatorTabBarOuterHeight(insets.bottom) }]}
      edges={["left", "right"]}
    >
      <Text style={styles.title}>المحادثات</Text>
      <Text style={styles.subtitle}>المحادثة العامة دائماً في الأعلى. محادثات الطلبات مع السائقين.</Text>
      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => {
          const livePreview = chatPreviewByRoom[item.id];
          const previewMessage = livePreview
            ? {
                sender: { fullName: livePreview.senderName },
                body: livePreview.body,
                imageUrl: livePreview.imageUrl === "push" ? "push" : livePreview.imageUrl,
                voiceUrl: livePreview.hasVoice ? "voice" : null
              }
            : item.lastMessage;

          return (
          <View style={[styles.row, item.type === "GLOBAL" && styles.rowGlobal]}>
            <Pressable
              style={styles.rowTap}
              onPress={() => router.push(chatRoomHref(item) as `/chat/${string}`)}
            >
              <View style={styles.rowInner}>
                <ChatPeerAvatar
                  name={chatRoomListTitle(item)}
                  size={46}
                  online={item.type === "ORDER" ? !!item.peerOnline : null}
                  backgroundColor={theme.colors.primary}
                  textColor={theme.colors.textInverse}
                  onlineColor={theme.colors.online}
                  offlineColor={theme.colors.textMuted}
                />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>
                    {item.type === "GLOBAL" ? "📢 " : ""}
                    {chatRoomListTitle(item)}
                  </Text>
                  {item.orderLabel ? <Text style={styles.rowPreview}>{item.orderLabel}</Text> : null}
                  {previewMessage?.body ? (
                    <Text style={styles.rowPreview} numberOfLines={1}>
                      {previewMessage.sender.fullName}: {previewMessage.body}
                    </Text>
                  ) : previewMessage?.voiceUrl ? (
                    <Text style={styles.rowPreview}>🎤 رسالة صوتية</Text>
                  ) : previewMessage?.imageUrl ? (
                    <Text style={styles.rowPreview}>📷 صورة</Text>
                  ) : null}
                  {unreadByRoom[item.id] ? (
                    <Text style={styles.unreadDot}>{unreadByRoom[item.id]} غير مقروء</Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
            {item.type === "ORDER" ? (
              <Pressable
                style={styles.rowArchiveBtn}
                onPress={() => confirmArchive(item)}
                disabled={archivingId === item.id}
                accessibilityRole="button"
                accessibilityLabel="أرشفة المحادثة"
              >
                {archivingId === item.id ? (
                  <ActivityIndicator color={theme.colors.textMuted} size="small" />
                ) : (
                  <Ionicons name="archive-outline" size={22} color={theme.colors.textMuted} />
                )}
              </Pressable>
            ) : null}
          </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.subtitle}>لا توجد محادثات بعد</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
