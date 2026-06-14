import {
  useTheme,
  useThemedStyles,
  ChatHeaderPeer,
  ChatImageZoomModal,
  KeyboardAvoidingView,
  useKeyboardOpen,
  MessageReceipt,
  TypingIndicator
} from "@taxi/expo-theme";
import { chatSocketEvents, socketEvents, type ChatReceiptStatus } from "@taxi/config";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { io, type Socket } from "socket.io-client";
import {
  type ChatMessageRow,
  archiveChatRoom,
  getChatAccessToken,
  listChatMessages,
  markChatRoomReadOnServer,
  sendChatMessage,
  uploadChatImage
} from "../lib/chat";
import { getDriverSession } from "../lib/session";
import { resolveAuthedChatImageUri } from "../lib/chat-image-auth";
import { captureCompressedChatPhoto } from "../lib/chat-image";
import { getSocketOrigin } from "../lib/api";
import { feedback } from "../lib/feedback";
import { rtlText } from "../lib/rtl-text";
import { useDriverStore } from "../store";

function ChatAuthedImage({
  imageUrl,
  token,
  frameStyle,
  accentColor,
  onOpen
}: {
  imageUrl: string;
  token: string;
  frameStyle: object;
  accentColor: string;
  onOpen: (uri: string) => void;
}) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLocalUri(null);
    setFailed(false);
    void resolveAuthedChatImageUri(imageUrl, token).then((uri) => {
      if (cancelled) return;
      if (uri) setLocalUri(uri);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, token]);

  if (failed) {
    return <Text style={rtlText}>[تعذر تحميل الصورة]</Text>;
  }

  if (!localUri) {
    return (
      <View style={[frameStyle, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={accentColor} />
      </View>
    );
  }

  return (
    <Pressable onPress={() => onOpen(localUri)} accessibilityRole="imagebutton" accessibilityLabel="عرض الصورة">
      <Image source={{ uri: localUri }} style={frameStyle} resizeMode="cover" />
    </Pressable>
  );
}

type Props = {
  roomId: string;
  title: string;
  subtitle?: string | null;
  canArchive?: boolean;
  onBack?: () => void;
};

export function ChatThreadView({ roomId, title, subtitle, canArchive = false, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myFullName, setMyFullName] = useState("");
  const [typingFrom, setTypingFrom] = useState<{ userId: string; fullName: string } | null>(null);
  const [zoomImageUri, setZoomImageUri] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [peerOnline, setPeerOnline] = useState<boolean | null>(null);
  const peerUserIdRef = useRef<string | null>(null);
  const peerDriverIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList<ChatMessageRow>>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActiveRef = useRef(false);
  const setActiveChatRoomId = useDriverStore((s) => s.setActiveChatRoomId);
  const markChatRoomRead = useDriverStore((s) => s.markChatRoomRead);

  const ackIncoming = useCallback((messageId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit(chatSocketEvents.DELIVERED, { messageId });
    socket.emit(chatSocketEvents.READ, { roomId });
    void markChatRoomReadOnServer(roomId);
  }, [roomId]);

  const updateReceipt = useCallback((messageId: string, status: ChatReceiptStatus) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, receiptStatus: status } : m))
    );
  }, []);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      socketRef.current?.emit(chatSocketEvents.TYPING_STOP, { roomId });
    }
  }, [roomId]);

  const onDraftChange = useCallback(
    (text: string) => {
      setDraft(text);
      const socket = socketRef.current;
      if (!socket || !myUserId) return;
      if (text.trim()) {
        if (!typingActiveRef.current) {
          typingActiveRef.current = true;
          socket.emit(chatSocketEvents.TYPING, { roomId, fullName: myFullName });
        }
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => stopTyping(), 2000);
      } else {
        stopTyping();
      }
    },
    [roomId, myFullName, myUserId, stopTyping]
  );

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const styles = useThemedStyles((t) => ({
    root: { flex: 1, backgroundColor: t.colors.background, direction: "rtl" as const },
    header: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
      backgroundColor: t.colors.surfaceCard
    },
    headerTitle: { fontSize: 17, fontWeight: "800" as const, color: t.colors.text, lineHeight: 22, ...rtlText },
    headerSubtitle: { fontSize: 12, color: t.colors.textMuted, marginTop: 3, lineHeight: 18, ...rtlText },
    backBtn: { padding: 6 },
    headerPeer: { flex: 1, minWidth: 0 },
    headerArchiveBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: t.colors.filterBg
    },
    list: { paddingHorizontal: 14, paddingVertical: 10 },
    bubbleMine: {
      alignSelf: "flex-start" as const,
      maxWidth: "82%",
      backgroundColor: t.colors.primary,
      borderRadius: 16,
      borderBottomStartRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 8
    },
    bubbleOther: {
      alignSelf: "flex-end" as const,
      maxWidth: "82%",
      backgroundColor: t.colors.surfaceCard,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 16,
      borderBottomEndRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 8
    },
    sender: { fontSize: 11, fontWeight: "700" as const, color: t.colors.textMuted, marginBottom: 4, ...rtlText },
    body: { fontSize: 15, lineHeight: 22, color: t.colors.text, ...rtlText },
    bodyMine: { color: t.colors.textInverse },
    metaRow: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      gap: 4,
      marginTop: 4
    },
    time: { fontSize: 10, color: t.colors.textMuted, ...rtlText },
    timeMine: { color: "rgba(255,255,255,0.82)" },
    typingBubble: {
      alignSelf: "flex-end" as const,
      maxWidth: "72%",
      backgroundColor: t.colors.surfaceCard,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 16,
      borderBottomEndRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8
    },
    typingLabel: { fontSize: 11, color: t.colors.textMuted, marginBottom: 6, ...rtlText },
    typingDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: t.colors.textMuted
    },
    imageFrame: {
      width: 240,
      maxWidth: "100%",
      height: 200,
      borderRadius: 12,
      marginTop: 4,
      backgroundColor: t.colors.surfaceInset
    },
    composer: {
      flexDirection: "row-reverse" as const,
      alignItems: "flex-end" as const,
      gap: 8,
      padding: 10,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.surfaceCard
    },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 120,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: t.colors.text,
      backgroundColor: t.colors.background,
      ...rtlText
    },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: t.colors.filterBg
    },
    sendBtn: { backgroundColor: t.colors.primary },
    centered: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const }
  }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await listChatMessages(roomId);
      setMessages(page.messages);
      peerUserIdRef.current = page.room.peerUserId;
      peerDriverIdRef.current = page.room.peerDriverId;
      setPeerOnline(page.room.peerOnline);
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر تحميل الرسائل");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
    void getChatAccessToken().then(setAccessToken);
    void getDriverSession().then((session) => {
      if (!session) return;
      setMyUserId(session.user.id);
      setMyFullName(session.user.fullName);
    });
    setActiveChatRoomId(roomId);
    markChatRoomRead(roomId);
    void markChatRoomReadOnServer(roomId);
    return () => {
      stopTyping();
      setActiveChatRoomId(null);
    };
  }, [load, roomId, setActiveChatRoomId, markChatRoomRead, stopTyping]);

  useEffect(() => {
    if (!loading) {
      scrollToBottom(false);
    }
  }, [loading, scrollToBottom]);

  useEffect(() => {
    const event = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const show = Keyboard.addListener(event, () => {
      setTimeout(() => scrollToBottom(true), 60);
    });
    return () => show.remove();
  }, [scrollToBottom]);

  useEffect(() => {
    const socket = io(getSocketOrigin(), { transports: ["websocket"] });
    socketRef.current = socket;
    const onConnect = () => {
      if (myUserId) socket.emit(chatSocketEvents.REGISTER, myUserId);
      socket.emit(chatSocketEvents.JOIN_ROOM, roomId);
      socket.emit(chatSocketEvents.READ, { roomId });
    };
    const onMessage = (msg: ChatMessageRow) => {
      if (msg.roomId !== roomId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (myUserId && msg.sender.id !== myUserId) {
        ackIncoming(msg.id);
      }
      setTimeout(() => scrollToBottom(true), 80);
    };
    const onTyping = (payload: { roomId?: string; userId?: string; fullName?: string }) => {
      if (payload.roomId !== roomId || !payload.userId || payload.userId === myUserId) return;
      setTypingFrom({ userId: payload.userId, fullName: payload.fullName ?? "" });
    };
    const onTypingStop = (payload: { roomId?: string; userId?: string }) => {
      if (payload.roomId !== roomId) return;
      setTypingFrom((prev) => (prev?.userId === payload.userId ? null : prev));
    };
    const onReceipt = (payload: { messageId?: string; status?: ChatReceiptStatus }) => {
      if (!payload.messageId || !payload.status) return;
      updateReceipt(payload.messageId, payload.status);
    };
    const onPresence = (payload: { userId?: string; online?: boolean }) => {
      if (payload.userId && payload.userId === peerUserIdRef.current) {
        setPeerOnline(!!payload.online);
      }
    };
    const onDriverOnline = (payload: { driverId?: string }) => {
      if (payload.driverId && payload.driverId === peerDriverIdRef.current) {
        setPeerOnline(true);
      }
    };
    const onDriverOffline = (payload: { driverId?: string }) => {
      if (payload.driverId && payload.driverId === peerDriverIdRef.current) {
        setPeerOnline(false);
      }
    };
    socket.on("connect", onConnect);
    socket.on(socketEvents.CHAT_MESSAGE, onMessage);
    socket.on(socketEvents.CHAT_TYPING, onTyping);
    socket.on(socketEvents.CHAT_TYPING_STOP, onTypingStop);
    socket.on(socketEvents.CHAT_RECEIPT, onReceipt);
    socket.on(socketEvents.CHAT_USER_PRESENCE, onPresence);
    socket.on(socketEvents.DRIVER_ONLINE, onDriverOnline);
    socket.on(socketEvents.DRIVER_OFFLINE, onDriverOffline);
    return () => {
      socket.emit(chatSocketEvents.LEAVE_ROOM, roomId);
      socket.off("connect", onConnect);
      socket.off(socketEvents.CHAT_MESSAGE, onMessage);
      socket.off(socketEvents.CHAT_TYPING, onTyping);
      socket.off(socketEvents.CHAT_TYPING_STOP, onTypingStop);
      socket.off(socketEvents.CHAT_RECEIPT, onReceipt);
      socket.off(socketEvents.CHAT_USER_PRESENCE, onPresence);
      socket.off(socketEvents.DRIVER_ONLINE, onDriverOnline);
      socket.off(socketEvents.DRIVER_OFFLINE, onDriverOffline);
      socket.disconnect();
    };
  }, [roomId, scrollToBottom, myUserId, ackIncoming, updateReceipt]);

  const confirmArchive = () => {
    if (archiving) return;
    feedback.confirmArchiveChat(() => {
      setArchiving(true);
      void archiveChatRoom(roomId)
        .then(() => {
          feedback.success("تمت أرشفة المحادثة.");
          onBack?.();
        })
        .catch((e) => {
          feedback.error(e instanceof Error ? e.message : "تعذر الأرشفة");
        })
        .finally(() => setArchiving(false));
    });
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    stopTyping();
    setDraft("");
    try {
      const msg = await sendChatMessage(roomId, text);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      scrollToBottom(true);
    } catch (e) {
      setDraft(text);
      feedback.error(e instanceof Error ? e.message : "تعذر الإرسال");
    } finally {
      setSending(false);
    }
  };

  const handleCaptureImage = async () => {
    const uri = await captureCompressedChatPhoto();
    if (!uri) {
      feedback.error("يجب السماح بالوصول للكاميرا");
      return;
    }
    setSending(true);
    try {
      const msg = await uploadChatImage(roomId, uri);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      scrollToBottom(true);
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر رفع الصورة");
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: ChatMessageRow }) => {
    const mine = item.sender.role === "DRIVER";
    return (
      <View style={mine ? styles.bubbleMine : styles.bubbleOther}>
        {!mine ? <Text style={styles.sender}>{item.sender.fullName}</Text> : null}
        {item.imageUrl && accessToken ? (
          <ChatAuthedImage
            imageUrl={item.imageUrl}
            token={accessToken}
            frameStyle={styles.imageFrame}
            accentColor={theme.colors.accent}
            onOpen={setZoomImageUri}
          />
        ) : item.imageExpired ? (
          <Text style={styles.body}>[انتهت صلاحية الصورة]</Text>
        ) : null}
        {item.body ? <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text> : null}
        <View style={styles.metaRow}>
          <Text style={[styles.time, mine && styles.timeMine]}>
            {new Date(item.createdAt).toLocaleTimeString("ar-SY", { hour: "2-digit", minute: "2-digit" })}
          </Text>
          {mine ? (
            <MessageReceipt
              status={item.receiptStatus}
              color={theme.colors.textInverse}
              readColor={theme.colors.accent}
            />
          ) : null}
        </View>
      </View>
    );
  };

  const composerBottomPad = keyboardOpen && Platform.OS === "ios" ? 10 : Math.max(insets.bottom, 10);

  const composer = (
    <View style={[styles.composer, { paddingBottom: composerBottomPad }]}>
      <Pressable
        style={styles.iconBtn}
        onPress={() => void handleCaptureImage()}
        disabled={sending}
        accessibilityLabel="التقاط صورة"
      >
        <Ionicons name="camera-outline" size={22} color={theme.colors.text} />
      </Pressable>
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={onDraftChange}
        placeholder="اكتب رسالة…"
        placeholderTextColor={theme.colors.textMuted}
        multiline
        onFocus={() => setTimeout(() => scrollToBottom(true), 80)}
      />
      <Pressable style={[styles.iconBtn, styles.sendBtn]} onPress={() => void handleSend()} disabled={sending}>
        {sending ? (
          <ActivityIndicator color={theme.colors.textInverse} size="small" />
        ) : (
          <Ionicons name="send" size={20} color={theme.colors.textInverse} />
        )}
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        {onBack ? (
          <Pressable style={styles.backBtn} onPress={onBack}>
            <Ionicons name="arrow-forward" size={22} color={theme.colors.text} />
          </Pressable>
        ) : null}
        <View style={styles.headerPeer}>
          <ChatHeaderPeer
            name={title}
            subtitle={subtitle}
            online={subtitle ? peerOnline : null}
            titleStyle={styles.headerTitle}
            subtitleStyle={styles.headerSubtitle}
            avatarBackground={theme.colors.primary}
            avatarText={theme.colors.textInverse}
            onlineColor={theme.colors.online}
            offlineColor={theme.colors.textMuted}
          />
        </View>
        {canArchive ? (
          <Pressable
            style={styles.headerArchiveBtn}
            onPress={confirmArchive}
            disabled={archiving}
            accessibilityRole="button"
            accessibilityLabel="أرشفة المحادثة"
          >
            {archiving ? (
              <ActivityIndicator color={theme.colors.textMuted} size="small" />
            ) : (
              <Ionicons name="archive-outline" size={22} color={theme.colors.textMuted} />
            )}
          </Pressable>
        ) : null}
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          onContentSizeChange={() => scrollToBottom(false)}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            typingFrom ? (
              <TypingIndicator
                label={typingFrom.fullName ? `${typingFrom.fullName} يكتب…` : "يكتب…"}
                bubbleStyle={styles.typingBubble}
                dotStyle={styles.typingDot}
                labelStyle={styles.typingLabel}
              />
            ) : null
          }
        />
      )}
      <ChatImageZoomModal
        uri={zoomImageUri}
        visible={!!zoomImageUri}
        onClose={() => setZoomImageUri(null)}
        backdropColor={theme.colors.overlay}
      />
      {composer}
    </KeyboardAvoidingView>
  );
}
