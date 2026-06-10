import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverScreenBackground } from "../../src/components/DriverScreenBackground";
import { DriverOrderCard } from "../../src/components/DriverOrderCard";
import { useDriverSocket } from "../../src/driver-socket-context";
import {
  type DriverOrderRow,
  type DriverSocketOrderPayload,
  driverAcceptOrder,
  driverCompleteOrder,
  driverMarkCustomerBoarded,
  driverReportCustomerNoShow,
  fetchDriverOrderRoom,
  socketPayloadToDriverOrderRow
} from "../../src/lib/api";
import { SOCKET_EVENTS } from "../../src/lib/socket-events";
import { getDriverLocationAccessState, isDriverLocationReady } from "../../src/lib/location-access";
import { clearDriverSession, getDriverSession } from "../../src/lib/session";
import { useDriverStore } from "../../src/store";
import { rtlText } from "../../src/lib/rtl-text";
import { driverTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { playDriverOrderPushSound } from "../../src/lib/order-push-sound";
import { playOrderResumedSound } from "../../src/lib/order-resumed-sound";
import { playNewPendingOrderSound } from "../../src/lib/pending-order-sound";
import { chatRoomHref, getOrderChatRoom } from "../../src/lib/chat";

function authFailureMessage(msg: string): boolean {
  return /Unauthorized|غير مصرح|Forbidden|401|403|تجديد الجلسة|انتهت صلاحية الجلسة|Invalid refresh/i.test(msg);
}

function isEnRouteToCustomer(status: string): boolean {
  return status === "EN_ROUTE_TO_CUSTOMER" || status === "ACCEPTED" || status === "ARRIVED";
}

export default function DriverOrdersTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const isOnline = useDriverStore((s) => s.isOnline);
  const setOnline = useDriverStore((s) => s.setOnline);
  const setRoomPendingCount = useDriverStore((s) => s.setRoomPendingCount);
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const [inProgress, setInProgress] = useState<DriverOrderRow | null>(null);
  const [pending, setPending] = useState<DriverOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionOrderId, setActionOrderId] = useState<string | null>(null);
  const { socket, myDriverId, socketConnected } = useDriverSocket();

  const inProgressRef = useRef<DriverOrderRow | null>(null);
  const myDriverIdRef = useRef<string | null>(null);

  inProgressRef.current = inProgress;
  myDriverIdRef.current = myDriverId;

  const goToLogin = useCallback(async () => {
    await clearDriverSession();
    router.replace("/login");
  }, [router]);

  const loadRoom = useCallback(async (isPull = false) => {
    const session = await getDriverSession();
    if (!session?.accessToken) {
      await goToLogin();
      return;
    }
    if (isPull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const room = await fetchDriverOrderRoom(session.accessToken);
      setInProgress(room.inProgress);
      setPending(room.pending);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "حدث خطأ";
      setError(msg);
      if (authFailureMessage(msg)) await goToLogin();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [goToLogin]);

  const loadRoomRef = useRef(loadRoom);
  loadRoomRef.current = loadRoom;

  useFocusEffect(
    useCallback(() => {
      void loadRoom(false);
    }, [loadRoom])
  );

  useEffect(() => {
    setRoomPendingCount(pending.length);
  }, [pending.length, setRoomPendingCount]);

  useEffect(() => {
    if (!isOnline) setPending([]);
  }, [isOnline]);

  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!wasOnlineRef.current && isOnline) {
      void loadRoomRef.current(false);
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    if (!socket || !myDriverId) return;

    const onNewOrder = (raw: unknown) => {
      if (!isOnlineRef.current) return;
      if (inProgressRef.current) return;
      const p = raw as DriverSocketOrderPayload;
      if (!p?.orderId) return;
      const row = socketPayloadToDriverOrderRow(p);
      setPending((prev) => {
        if (prev.some((o) => o.id === row.id)) return prev;
        void playNewPendingOrderSound();
        return [row, ...prev];
      });
    };

    const onAssigned = (raw: unknown) => {
      const p = raw as DriverSocketOrderPayload;
      if (!p?.orderId) return;
      setPending((prev) => prev.filter((o) => o.id !== p.orderId));
      if (myDriverIdRef.current && p.driverId === myDriverIdRef.current) {
        void playDriverOrderPushSound("ORDER_ASSIGNED");
        void loadRoomRef.current(false);
      }
    };

    const onPendingCancelled = (raw: unknown) => {
      const id = typeof raw === "object" && raw !== null && "orderId" in raw ? (raw as { orderId: string }).orderId : null;
      if (typeof id === "string") {
        setPending((prev) => prev.filter((o) => o.id !== id));
      }
    };

    const onOrderStatusUpdated = (raw: unknown) => {
      const p = raw as { driverId?: string | null; status?: string };
      if (!myDriverIdRef.current || p?.driverId !== myDriverIdRef.current) return;
      if (p.status === "EN_ROUTE_TO_CUSTOMER") {
        void playOrderResumedSound();
      }
      void loadRoomRef.current(false);
    };

    socket.on(SOCKET_EVENTS.NEW_ORDER, onNewOrder);
    socket.on(SOCKET_EVENTS.ORDER_ASSIGNED, onAssigned);
    socket.on(SOCKET_EVENTS.ORDER_PENDING_CANCELLED, onPendingCancelled);
    socket.on(SOCKET_EVENTS.ORDER_STATUS_UPDATED, onOrderStatusUpdated);

    return () => {
      socket.off(SOCKET_EVENTS.NEW_ORDER, onNewOrder);
      socket.off(SOCKET_EVENTS.ORDER_ASSIGNED, onAssigned);
      socket.off(SOCKET_EVENTS.ORDER_PENDING_CANCELLED, onPendingCancelled);
      socket.off(SOCKET_EVENTS.ORDER_STATUS_UPDATED, onOrderStatusUpdated);
    };
  }, [socket, myDriverId]);

  const onAccept = async (orderId: string) => {
    const session = await getDriverSession();
    if (!session?.accessToken) {
      await goToLogin();
      return;
    }
    setActionOrderId(orderId);
    setError(null);
    try {
      const row = await driverAcceptOrder(session.accessToken, orderId);
      setInProgress(row);
      setPending([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر استلام الطلب";
      setError(msg);
      Alert.alert("تعذر القبول", msg);
      if (authFailureMessage(msg)) await goToLogin();
      else void loadRoom(false);
    } finally {
      setActionOrderId(null);
    }
  };

  const onBoard = async (orderId: string) => {
    const session = await getDriverSession();
    if (!session?.accessToken) {
      await goToLogin();
      return;
    }
    setActionOrderId(orderId);
    setError(null);
    try {
      const row = await driverMarkCustomerBoarded(session.accessToken, orderId);
      setInProgress(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر تأكيد الركوب";
      setError(msg);
      Alert.alert("تعذر التأكيد", msg);
      if (authFailureMessage(msg)) await goToLogin();
      else void loadRoom(false);
    } finally {
      setActionOrderId(null);
    }
  };

  const onNoShow = async (orderId: string) => {
    const session = await getDriverSession();
    if (!session?.accessToken) {
      await goToLogin();
      return;
    }
    setActionOrderId(orderId);
    setError(null);
    try {
      await driverReportCustomerNoShow(session.accessToken, orderId);
      setInProgress(null);
      await loadRoom(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر تسجيل الحالة";
      setError(msg);
      Alert.alert("تعذر التسجيل", msg);
      if (authFailureMessage(msg)) await goToLogin();
    } finally {
      setActionOrderId(null);
    }
  };

  const onComplete = async (orderId: string) => {
    const session = await getDriverSession();
    if (!session?.accessToken) {
      await goToLogin();
      return;
    }
    setActionOrderId(orderId);
    setError(null);
    try {
      await driverCompleteOrder(session.accessToken, orderId);
      setInProgress(null);
      await loadRoom(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر إكمال التوصيل";
      setError(msg);
      Alert.alert("تعذر الإكمال", msg);
      if (authFailureMessage(msg)) await goToLogin();
    } finally {
      setActionOrderId(null);
    }
  };

  const onStartWork = async () => {
    const locationState = await getDriverLocationAccessState();
    if (!isDriverLocationReady(locationState)) {
      setOnline(false);
      router.replace("/location-access");
      return;
    }
    setOnline(true);
  };

  const listBottomPad = driverTabBarOuterHeight(insets.bottom) + 24;

  const styles = useThemedStyles((t) => ({
    safe: {
      flex: 1,
      backgroundColor: "transparent",
      direction: "rtl" as const
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 8,
      direction: "rtl" as const
    },
    headerLoading: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 4,
      direction: "rtl" as const
    },
    topBar: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      marginBottom: 10,
      gap: 12
    },
    topBarStatus: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      flex: 1,
      gap: 8
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5
    },
    statusDotOk: {
      backgroundColor: t.colors.online
    },
    statusDotBad: {
      backgroundColor: t.colors.offline
    },
    topBarStatusText: {
      fontSize: 13,
      color: t.colors.textSubtle,
      ...rtlText,
      flex: 1,
      textAlign: "right" as const
    },
    refreshBtn: {
      backgroundColor: t.colors.buttonSecondaryBg,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10
    },
    refreshBtnPressed: {
      opacity: 0.85
    },
    refreshBtnText: {
      fontSize: 14,
      fontWeight: "700" as const,
      color: t.colors.text,
      ...rtlText
    },
    centered: {
      flex: 1,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingHorizontal: 24
    },
    loadingText: {
      marginTop: 12,
      color: t.colors.textMuted,
      fontSize: 15,
      ...rtlText,
      width: "100%",
      textAlign: "center" as const
    },
    title: {
      fontSize: 22,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 8,
      textAlign: "right" as const
    },
    subtitle: {
      fontSize: 13,
      color: t.colors.textMuted,
      ...rtlText,
      lineHeight: 20,
      marginBottom: 8,
      textAlign: "right" as const
    },
    offlineHint: {
      fontSize: 13,
      color: t.colors.warning,
      ...rtlText,
      lineHeight: 20,
      marginBottom: 6,
      textAlign: "right" as const
    },
    error: {
      color: t.colors.danger,
      ...rtlText,
      marginTop: 8,
      textAlign: "right" as const
    },
    list: {
      paddingHorizontal: 20,
      alignItems: "stretch" as const
    },
    emptyList: {
      flexGrow: 1,
      paddingHorizontal: 20,
      alignItems: "stretch" as const
    },
    empty: {
      color: t.colors.textMuted,
      ...rtlText,
      marginTop: 40,
      fontSize: 15,
      lineHeight: 24,
      textAlign: "right" as const
    },
    offlineCenterCard: {
      marginTop: 48,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: t.colors.surfaceCard,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 24,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
      elevation: 4
    },
    offlineCenterTitle: {
      marginTop: 10,
      color: t.colors.text,
      fontSize: 18,
      fontWeight: "800" as const,
      ...rtlText,
      textAlign: "center" as const
    },
    offlineCenterText: {
      marginTop: 8,
      color: t.colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
      ...rtlText,
      textAlign: "center" as const
    },
    offlineCenterBtn: {
      marginTop: 16,
      backgroundColor: t.colors.success,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 24,
      minWidth: 170,
      alignItems: "center" as const
    },
    offlineCenterBtnText: {
      color: t.colors.textInverse,
      fontSize: 15,
      fontWeight: "800" as const,
      ...rtlText
    },
    footerRow: {
      flexDirection: "row-reverse" as const,
      flexWrap: "wrap" as const,
      gap: 10,
      marginTop: 12,
      justifyContent: "flex-end" as const
    },
    btnPrimary: {
      flex: 1,
      minWidth: 140,
      backgroundColor: t.colors.success,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center" as const
    },
    btnPrimaryText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 16,
      ...rtlText
    },
    btnWarning: {
      flex: 1,
      minWidth: 140,
      backgroundColor: t.colors.busy,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center" as const
    },
    btnWarningText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 15,
      ...rtlText
    },
    btnAccept: {
      marginTop: 12,
      backgroundColor: t.colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center" as const
    },
    btnAcceptText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 16,
      ...rtlText
    },
    btnDisabled: {
      opacity: 0.6
    },
    btnChat: {
      flex: 1,
      minWidth: 100,
      backgroundColor: t.colors.infoBg,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 6,
      borderWidth: 1,
      borderColor: t.colors.info
    },
    btnChatText: {
      color: t.colors.infoText,
      fontWeight: "800" as const,
      fontSize: 14,
      ...rtlText
    }
  }));

  const openOrderChat = async (orderId: string) => {
    try {
      const room = await getOrderChatRoom(orderId);
      router.push(chatRoomHref(room) as `/chat/${string}`);
    } catch (e) {
      Alert.alert("خطأ", e instanceof Error ? e.message : "تعذر فتح المحادثة");
    }
  };

  const chatBtn = (orderId: string) => (
    <Pressable style={styles.btnChat} onPress={() => void openOrderChat(orderId)} accessibilityLabel="محادثة الطلب">
      <Ionicons name="chatbubble-outline" size={16} color={theme.colors.infoText} />
      <Text style={styles.btnChatText}>محادثة</Text>
    </Pressable>
  );

  const connectionStatusRow = (
    <View style={styles.topBar}>
      <View style={styles.topBarStatus}>
        <View style={[styles.statusDot, socketConnected ? styles.statusDotOk : styles.statusDotBad]} />
        <Text style={styles.topBarStatusText}>
          {socketConnected ? " متصل " : " غير متصل"}
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.refreshBtn, pressed && styles.refreshBtnPressed]}
        onPress={() => void loadRoom(true)}
        disabled={refreshing}
      >
        <Text style={styles.refreshBtnText}>{refreshing ? "…" : "تحديث"}</Text>
      </Pressable>
    </View>
  );

  if (loading && !inProgress && pending.length === 0 && !error) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <DriverScreenBackground>
          <View style={styles.headerLoading}>
            {connectionStatusRow}
            <Text style={styles.title}>غرفة الطلبات</Text>
          </View>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>جاري تحميل غرفة الطلبات…</Text>
          </View>
        </DriverScreenBackground>
      </SafeAreaView>
    );
  }

  const data = inProgress ? [inProgress] : pending;

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <DriverScreenBackground>
        <View style={styles.header}>
          {connectionStatusRow}
          <Text style={styles.title}>غرفة الطلبات</Text>
         
          {!isOnline ? (
            <Text style={styles.offlineHint}>فعّل بدء العمل من القائمة لاستلام الطلبات.</Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          extraData={{ inProgress: !!inProgress, actionOrderId }}
          renderItem={({ item }) => {
          const busy = actionOrderId === item.id;
          if (inProgress) {
            if (isEnRouteToCustomer(item.status)) {
              return (
                <DriverOrderCard
                  item={item}
                  footer={
                    <View style={styles.footerRow}>
                      {chatBtn(item.id)}
                      <Pressable
                        style={[styles.btnWarning, busy && styles.btnDisabled]}
                        disabled={!!busy}
                        onPress={() => void onNoShow(item.id)}
                      >
                        {busy ? (
                          <ActivityIndicator color={theme.colors.textInverse} />
                        ) : (
                          <Text style={styles.btnWarningText}>لم أجد الزبون</Text>
                        )}
                      </Pressable>
                      <Pressable
                        style={[styles.btnPrimary, busy && styles.btnDisabled]}
                        disabled={!!busy}
                        onPress={() => void onBoard(item.id)}
                      >
                        {busy ? (
                          <ActivityIndicator color={theme.colors.textInverse} />
                        ) : (
                          <Text style={styles.btnPrimaryText}>تم استلام الزبون</Text>
                        )}
                      </Pressable>
                    </View>
                  }
                />
              );
            }
            if (item.status === "STARTED") {
              return (
                <DriverOrderCard
                  item={item}
                  footer={
                    <View style={styles.footerRow}>
                      {chatBtn(item.id)}
                      <Pressable
                        style={[styles.btnPrimary, busy && styles.btnDisabled]}
                        disabled={!!busy}
                        onPress={() => void onComplete(item.id)}
                      >
                      {busy ? (
                        <ActivityIndicator color={theme.colors.textInverse} />
                      ) : (
                        <Text style={styles.btnPrimaryText}>تم توصيل الزبون</Text>
                      )}
                      </Pressable>
                    </View>
                  }
                />
              );
            }
            return <DriverOrderCard item={item} />;
          }
          return (
            <DriverOrderCard
              item={item}
              footer={
                <Pressable
                  style={[styles.btnAccept, busy && styles.btnDisabled]}
                  disabled={!!busy}
                  onPress={() => void onAccept(item.id)}
                >
                  {busy ? (
                    <ActivityIndicator color={theme.colors.textInverse} />
                  ) : (
                    <Text style={styles.btnAcceptText}>استلام الطلب</Text>
                  )}
                </Pressable>
              }
            />
          );
          }}
          contentContainerStyle={
            data.length === 0
              ? [styles.emptyList, { paddingBottom: listBottomPad }]
              : [styles.list, { paddingBottom: listBottomPad }]
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadRoom(true)} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            isOnline ? (
              <Text style={styles.empty}>لا توجد طلبات معلقة حاليًا. انتظر إشعار طلب جديد.</Text>
            ) : (
              <View style={styles.offlineCenterCard}>
                <Ionicons name="play-circle-outline" size={42} color={theme.colors.success} />
                <Text style={styles.offlineCenterTitle}>أنت متوقف عن العمل</Text>
                <Text style={styles.offlineCenterText}>
                  اضغط الزر أدناه لبدء العمل مباشرة واستلام الطلبات الجديدة.
                </Text>
                <Pressable style={styles.offlineCenterBtn} onPress={() => void onStartWork()}>
                  <Text style={styles.offlineCenterBtnText}>بدء العمل</Text>
                </Pressable>
              </View>
            )
          }
        />
      </DriverScreenBackground>
    </SafeAreaView>
  );
}

