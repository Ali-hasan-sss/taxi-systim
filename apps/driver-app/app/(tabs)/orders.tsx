import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
import { clearDriverSession, getDriverSession } from "../../src/lib/session";
import { useDriverStore } from "../../src/store";
import { rtlText } from "../../src/lib/rtl-text";
import { driverTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { playOrderResumedSound } from "../../src/lib/order-resumed-sound";
import { playNewPendingOrderSound } from "../../src/lib/pending-order-sound";

function authFailureMessage(msg: string): boolean {
  return /Unauthorized|غير مصرح|Forbidden|401|403|تجديد الجلسة|انتهت صلاحية الجلسة|Invalid refresh/i.test(msg);
}

function isEnRouteToCustomer(status: string): boolean {
  return status === "EN_ROUTE_TO_CUSTOMER" || status === "ACCEPTED" || status === "ARRIVED";
}

export default function DriverOrdersTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isOnline = useDriverStore((s) => s.isOnline);
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

  const listBottomPad = driverTabBarOuterHeight(insets.bottom) + 24;

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
        <View style={styles.headerLoading}>
          {connectionStatusRow}
          <Text style={styles.title}>غرفة الطلبات</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>جاري تحميل غرفة الطلبات…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const data = inProgress ? [inProgress] : pending;

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <View style={styles.header}>
        {connectionStatusRow}
        <Text style={styles.title}>غرفة الطلبات</Text>
        <Text style={styles.subtitle}>
          {inProgress
            ? isEnRouteToCustomer(inProgress.status)
              ? "أنت في الطريق إلى الزبون: أكد «تم ركوب الزبون» أو «لم أجد الزبون»."
              : "الزبون في السيارة: اضغط «تم توصيل الزبون» بعد إنهاء التوصيل."
            : "الطلبات المعلقة تظهر لحظيًا. بعد القبول تصبح «في الطريق إلى الزبون». الإلغاء من المنسق فقط."}
        </Text>
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
                      <Pressable
                        style={[styles.btnWarning, busy && styles.btnDisabled]}
                        disabled={!!busy}
                        onPress={() => void onNoShow(item.id)}
                      >
                        {busy ? (
                          <ActivityIndicator color="#fff" />
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
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.btnPrimaryText}>تم ركوب الزبون</Text>
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
                    <Pressable
                      style={[styles.btnPrimary, busy && styles.btnDisabled]}
                      disabled={!!busy}
                      onPress={() => void onComplete(item.id)}
                    >
                      {busy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.btnPrimaryText}>تم توصيل الزبون</Text>
                      )}
                    </Pressable>
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
                    <ActivityIndicator color="#fff" />
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadRoom(true)} tintColor="#2563eb" />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isOnline
              ? "لا توجد طلبات معلقة حاليًا. انتظر إشعار طلب جديد."
              : "لا توجد طلبات. فعّل بدء العمل من القائمة  لاستلام الطلبات."}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc",
    direction: "rtl"
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8
  },
  headerLoading: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 12
  },
  topBarStatus: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  statusDotOk: {
    backgroundColor: "#16a34a"
  },
  statusDotBad: {
    backgroundColor: "#dc2626"
  },
  topBarStatusText: {
    fontSize: 13,
    color: "#475569",
    ...rtlText,
    flex: 1
  },
  refreshBtn: {
    backgroundColor: "#e2e8f0",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10
  },
  refreshBtnPressed: {
    opacity: 0.85
  },
  refreshBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    ...rtlText
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24
  },
  loadingText: {
    marginTop: 12,
    color: "#64748b",
    fontSize: 15,
    ...rtlText,
    width: "100%",
    textAlign: "center"
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    ...rtlText,
    marginBottom: 8
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    ...rtlText,
    lineHeight: 20,
    marginBottom: 8
  },
  offlineHint: {
    fontSize: 13,
    color: "#b45309",
    ...rtlText,
    lineHeight: 20,
    marginBottom: 6
  },
  error: {
    color: "#dc2626",
    ...rtlText,
    marginTop: 8
  },
  list: {
    paddingHorizontal: 20,
    alignItems: "stretch"
  },
  emptyList: {
    flexGrow: 1,
    paddingHorizontal: 20,
    alignItems: "stretch"
  },
  empty: {
    color: "#64748b",
    ...rtlText,
    marginTop: 40,
    fontSize: 15,
    lineHeight: 24
  },
  footerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
    justifyContent: "flex-start"
  },
  btnPrimary: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "#15803d",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center"
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    ...rtlText
  },
  btnWarning: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "#c2410c",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center"
  },
  btnWarningText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    ...rtlText
  },
  btnAccept: {
    marginTop: 12,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center"
  },
  btnAcceptText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    ...rtlText
  },
  btnDisabled: {
    opacity: 0.6
  }
});
