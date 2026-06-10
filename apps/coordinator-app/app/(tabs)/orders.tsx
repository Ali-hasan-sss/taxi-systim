import { useTheme, useThemedStyles, KeyboardAvoidingView } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coordinatorTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { io, type Socket } from "socket.io-client";
import { CoordinatorOrderCard } from "../../src/components/CoordinatorOrderCard";
import {
  type CoordinatorActiveOrdersSegment,
  type CoordinatorOrderFilterCounts,
  type CoordinatorOrderRow,
  type DriverForAssignment,
  coordinatorAssignOrder,
  coordinatorCancelOrder,
  coordinatorResumeStuckOrder,
  coordinatorSearchDriversForAssignment,
  coordinatorListOrders,
  coordinatorMe,
  coordinatorOrderStats,
  getSocketOrigin
} from "../../src/lib/api";
import { feedback } from "../../src/lib/feedback";
import { playCoordinatorOrderPushSound } from "../../src/lib/order-push-sound";
import { playOrderStuckSound } from "../../src/lib/order-stuck-sound";
import { clearSession, getSession } from "../../src/lib/session";
import { useCoordinatorStore } from "../../src/store";
import { rtlText } from "../../src/lib/rtl-text";
import { chatRoomHref, getOrderChatRoom } from "../../src/lib/chat";

type OrderFilterDef = {
  key: CoordinatorActiveOrdersSegment | null;
  label: string;
  countKey: keyof CoordinatorOrderFilterCounts;
};

const ORDER_FILTER_ROWS: OrderFilterDef[][] = [
  [
    { key: null, label: "الكل", countKey: "all" },
    { key: "needs_invoice", label: "بحاجة فاتورة", countKey: "needs_invoice" },
    { key: "needs_info", label: "بحاجة معلومات", countKey: "needs_info" }
  ],
  [
    { key: "stuck", label: "متعثرة", countKey: "stuck" },
    { key: "pending", label: "معلقة", countKey: "pending" },
    { key: "completed", label: "مكتملة", countKey: "completed" }
  ]
];

const EMPTY_FILTER_MESSAGES: Record<CoordinatorActiveOrdersSegment | "all", string> = {
  all: "لا توجد طلبات. أنشئ طلبًا من زر + في الشريط السفلي.",
  needs_info: "لا توجد طلبات بحاجة لإرسال معلومات السائق للزبون.",
  needs_invoice: "لا توجد طلبات مكتملة بحاجة لإرسال فاتورة.",
  stuck: "لا توجد طلبات متعثرة.",
  pending: "لا توجد طلبات معلقة.",
  completed: "لا توجد طلبات مكتملة.",
  in_progress: "لا توجد طلبات في الطريق."
};

export default function OrdersTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles((t) => ({
    rtlScreen: {
      direction: "rtl" as const,
      alignItems: "stretch" as const
    },
    root: {
      flex: 1,
      backgroundColor: t.colors.background,
      direction: "rtl" as const
    },
    centered: {
      flex: 1,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      backgroundColor: t.colors.background,
      paddingHorizontal: 24
    },
    loadingText: {
      marginTop: 12,
      color: t.colors.textMuted,
      fontSize: 15,
      ...rtlText,
      width: "100%"
    },
    title: {
      fontSize: 22,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 8,
      paddingHorizontal: 20
    },
    subtitle: {
      fontSize: 13,
      color: t.colors.textMuted,
      ...rtlText,
      lineHeight: 20,
      marginBottom: 10,
      paddingHorizontal: 20
    },
    filterPanel: {
      paddingHorizontal: 20,
      paddingTop: 6,
      marginBottom: 12,
      gap: 8,
      overflow: "visible" as const
    },
    filterRow: {
      flexDirection: "row-reverse" as const,
      gap: 8,
      alignItems: "stretch" as const,
      overflow: "visible" as const
    },
    filterChip: {
      flex: 1,
      position: "relative" as const,
      overflow: "visible" as const,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 14,
      backgroundColor: t.colors.filterBg,
      borderWidth: 1,
      borderColor: t.colors.filterBorder,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      minHeight: 44
    },
    filterChipActive: {
      backgroundColor: t.colors.filterActiveBg,
      borderColor: t.colors.filterActiveBorder
    },
    filterChipPressed: {
      opacity: 0.9
    },
    filterChipText: {
      color: t.colors.filterText,
      fontWeight: "700" as const,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center" as const,
      flexShrink: 1,
      ...rtlText,
      ...Platform.select({ android: { includeFontPadding: false }, default: {} })
    },
    filterChipTextActive: {
      color: t.colors.filterActiveText
    },
    filterBadge: {
      position: "absolute" as const,
      top: -8,
      left: -4,
      zIndex: 2,
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      borderRadius: 10,
      backgroundColor: t.colors.chipBg,
      borderWidth: 2,
      borderColor: t.colors.background,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      ...Platform.select({
        android: { elevation: 3 },
        default: {}
      })
    },
    filterBadgeActive: {
      backgroundColor: t.colors.filterActiveText,
      borderColor: t.colors.filterActiveBg
    },
    filterBadgeText: {
      color: t.colors.chipText,
      fontSize: 11,
      fontWeight: "800" as const,
      ...rtlText,
      ...Platform.select({ android: { includeFontPadding: false }, default: {} })
    },
    filterBadgeTextActive: {
      color: t.colors.filterActiveBg
    },
    error: {
      color: t.colors.danger,
      ...rtlText,
      paddingHorizontal: 20,
      marginBottom: 8
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
    listFooterLoader: {
      paddingVertical: 20,
      alignItems: "center" as const
    },
    actions: {
      flexDirection: "row-reverse" as const,
      gap: 10,
      justifyContent: "flex-start" as const,
      flexWrap: "wrap" as const,
      marginTop: 4
    },
    btnDanger: {
      backgroundColor: t.colors.dangerBg,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      minWidth: 120,
      alignItems: "center" as const
    },
    btnDangerText: {
      color: t.colors.dangerText,
      fontWeight: "800" as const,
      fontSize: 14,
      ...rtlText
    },
    btnChat: {
      backgroundColor: t.colors.infoBg,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      minWidth: 100,
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
    },
    btnPrimary: {
      backgroundColor: t.colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      minWidth: 120,
      alignItems: "center" as const
    },
    btnPrimaryText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 14,
      ...rtlText
    },
    btnResumeStuck: {
      backgroundColor: t.colors.infoBg,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      minWidth: 120,
      alignItems: "center" as const
    },
    btnResumeStuckText: {
      color: t.colors.infoText,
      fontWeight: "800" as const,
      fontSize: 14,
      ...rtlText
    },
    btnDisabled: {
      opacity: 0.55
    },
    empty: {
      color: t.colors.textSubtle,
      ...rtlText,
      marginTop: 40,
      fontSize: 15,
      lineHeight: 24
    },
    modalRoot: {
      flex: 1,
      justifyContent: "flex-end" as const
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.colors.overlay
    },
    modalSheet: {
      backgroundColor: t.colors.modalBg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 20,
      maxHeight: "85%",
      minHeight: 280,
      borderWidth: 1,
      borderColor: t.colors.modalBorder
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 6
    },
    modalHint: {
      fontSize: 12,
      color: t.colors.textMuted,
      ...rtlText,
      marginBottom: 12
    },
    searchInput: {
      backgroundColor: t.colors.inputBg,
      borderWidth: 1,
      borderColor: t.colors.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: t.colors.text,
      marginBottom: 12,
      ...rtlText
    },
    assignScrollContent: {
      alignItems: "stretch" as const,
      paddingBottom: 8
    },
    modalLoading: {
      marginVertical: 32,
      minHeight: 120
    },
    assignDriversWrap: {
      marginTop: 4
    },
    driverRow: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: t.colors.surfaceInset,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: "stretch" as const
    },
    driverRowDisabled: {
      opacity: 0.45
    },
    driverName: {
      color: t.colors.text,
      fontWeight: "800" as const,
      fontSize: 16,
      ...rtlText
    },
    driverMeta: {
      color: t.colors.textMuted,
      fontSize: 12,
      ...rtlText,
      marginTop: 4
    },
    noDrivers: {
      color: t.colors.textSubtle,
      ...rtlText,
      paddingVertical: 16
    },
    modalClose: {
      marginTop: 12,
      alignItems: "center" as const,
      paddingVertical: 12
    },
    modalCloseText: {
      color: t.colors.link,
      fontWeight: "800" as const,
      fontSize: 16,
      ...rtlText
    }
  }));
  const setStuckOrdersCount = useCoordinatorStore((s) => s.setStuckOrdersCount);
  const orderRefreshTick = useCoordinatorStore((s) => s.orderRefreshTick);
  const [orders, setOrders] = useState<CoordinatorOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myCoordinatorId, setMyCoordinatorId] = useState<string | null>(null);
  const [coordinatorFullName, setCoordinatorFullName] = useState("—");
  const [filterCounts, setFilterCounts] = useState<CoordinatorOrderFilterCounts>({
    all: 0,
    needs_info: 0,
    needs_invoice: 0,
    stuck: 0,
    pending: 0,
    completed: 0
  });
  const [actionOrderId, setActionOrderId] = useState<string | null>(null);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignOrderId, setAssignOrderId] = useState<string | null>(null);
  const [assignDrivers, setAssignDrivers] = useState<DriverForAssignment[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const assignSearchAbortRef = useRef<AbortController | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listSegment, setListSegment] = useState<CoordinatorActiveOrdersSegment | null>(null);
  const loadMoreLock = useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    const session = await getSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const listOpts =
        listSegment != null ? { segment: listSegment } : undefined;
      const [me, page, stats] = await Promise.all([
        coordinatorMe(session.accessToken),
        coordinatorListOrders(session.accessToken, "active", listOpts),
        coordinatorOrderStats(session.accessToken)
      ]);
      setMyCoordinatorId(me.coordinatorId);
      if (me.fullName?.trim()) setCoordinatorFullName(me.fullName.trim());
      setOrders(page.orders);
      setNextCursor(page.nextCursor);
      setStuckOrdersCount(stats.stuckActive ?? 0);
      if (stats.filterCounts) setFilterCounts(stats.filterCounts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "حدث خطأ";
      setError(msg);
      if (msg.includes("Unauthorized") || msg.includes("غير مصرح")) {
        await clearSession();
        router.replace("/login");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router, listSegment]);

  const loadMore = useCallback(async () => {
    if (nextCursor == null || loadMoreLock.current || loading || refreshing) {
      return;
    }
    const session = await getSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }
    loadMoreLock.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const listOpts =
        listSegment != null
          ? { cursor: nextCursor, segment: listSegment }
          : { cursor: nextCursor };
      const page = await coordinatorListOrders(session.accessToken, "active", listOpts);
      setOrders((prev) => {
        const seen = new Set(prev.map((o) => o.id));
        const out = [...prev];
        for (const o of page.orders) {
          if (!seen.has(o.id)) {
            seen.add(o.id);
            out.push(o);
          }
        }
        return out;
      });
      setNextCursor(page.nextCursor);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "حدث خطأ";
      setError(msg);
      if (msg.includes("Unauthorized") || msg.includes("غير مصرح")) {
        await clearSession();
        router.replace("/login");
      }
    } finally {
      loadMoreLock.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor, loading, refreshing, router, listSegment]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const listSegmentChangedRef = useRef(false);
  useEffect(() => {
    if (!listSegmentChangedRef.current) {
      listSegmentChangedRef.current = true;
      return;
    }
    void load(false);
  }, [listSegment]);

  const orderRefreshTickRef = useRef(orderRefreshTick);
  useEffect(() => {
    if (orderRefreshTickRef.current === orderRefreshTick) return;
    orderRefreshTickRef.current = orderRefreshTick;
    void load(true);
  }, [orderRefreshTick, load]);

  const myCoordinatorIdRef = useRef<string | null>(null);
  myCoordinatorIdRef.current = myCoordinatorId;
  const coordinatorSocketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const origin = getSocketOrigin();
    let socket: Socket | null = null;
    try {
      socket = io(origin, { transports: ["websocket"] });
      coordinatorSocketRef.current = socket;
      const registerCoordinator = () => {
        const id = myCoordinatorIdRef.current;
        if (id && socket?.connected) {
          socket.emit("coordinator:register", id);
        }
      };
      socket.on("connect", registerCoordinator);
      if (socket.connected) registerCoordinator();
      const maybeReload = (payload: { coordinatorId?: string }) => {
        const cid = myCoordinatorIdRef.current;
        if (!cid) {
          void load(true);
          return;
        }
        if (payload?.coordinatorId === cid) {
          void load(true);
        }
      };
      const onStatusUpdated = (raw: unknown) => {
        const p = raw as { coordinatorId?: string; status?: string };
        const cid = myCoordinatorIdRef.current;
        if (!cid || p?.coordinatorId !== cid) {
          maybeReload(p);
          return;
        }
        if (p.status === "STUCK") {
          void playOrderStuckSound();
        } else if (p.status === "EN_ROUTE_TO_CUSTOMER") {
          void playCoordinatorOrderPushSound("ORDER_NEEDS_INFO");
        } else if (p.status === "COMPLETED") {
          void playCoordinatorOrderPushSound("ORDER_NEEDS_INVOICE");
        }
        maybeReload(p);
      };
      socket.on("NEW_ORDER", maybeReload);
      socket.on("ORDER_ASSIGNED", maybeReload);
      socket.on("ORDER_STATUS_UPDATED", onStatusUpdated);
    } catch {
      /* ignore */
    }
    return () => {
      coordinatorSocketRef.current = null;
      socket?.disconnect();
    };
  }, [load]);

  useEffect(() => {
    const id = myCoordinatorIdRef.current;
    const s = coordinatorSocketRef.current;
    if (id && s?.connected) {
      s.emit("coordinator:register", id);
    }
  }, [myCoordinatorId]);

  const openAssignModal = (orderId: string) => {
    assignSearchAbortRef.current?.abort();
    assignSearchAbortRef.current = null;
    setAssignOrderId(orderId);
    setAssignQuery("");
    setAssignDrivers([]);
    setAssignLoading(false);
    setAssignModalOpen(true);
  };

  useEffect(() => {
    if (!assignModalOpen) {
      assignSearchAbortRef.current?.abort();
      assignSearchAbortRef.current = null;
      return;
    }

    const trimmed = assignQuery.trim();
    if (trimmed.length < 2) {
      assignSearchAbortRef.current?.abort();
      assignSearchAbortRef.current = null;
      setAssignDrivers([]);
      setAssignLoading(false);
      return;
    }

    setAssignLoading(true);
    const handle = setTimeout(() => {
      assignSearchAbortRef.current?.abort();
      const ac = new AbortController();
      assignSearchAbortRef.current = ac;

      void (async () => {
        try {
          const session = await getSession();
          if (!session?.accessToken) {
            if (!ac.signal.aborted) {
              setAssignModalOpen(false);
              setAssignOrderId(null);
              router.replace("/login");
            }
            return;
          }
          const list = await coordinatorSearchDriversForAssignment(session.accessToken, trimmed, ac.signal);
          if (!ac.signal.aborted) {
            setAssignDrivers(Array.isArray(list) ? list : []);
          }
        } catch (e) {
          if (ac.signal.aborted) return;
          feedback.error(e instanceof Error ? e.message : "تعذر تحميل قائمة السائقين.");
        } finally {
          if (!ac.signal.aborted) {
            setAssignLoading(false);
          }
        }
      })();
    }, 400);

    return () => {
      clearTimeout(handle);
      assignSearchAbortRef.current?.abort();
    };
  }, [assignModalOpen, assignQuery, router]);

  const confirmCancel = (orderId: string) => {
    feedback.confirmCancelOrder(() => void runCancel(orderId));
  };

  const runCancel = async (orderId: string) => {
    const session = await getSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }
    setActionOrderId(orderId);
    try {
      await coordinatorCancelOrder(session.accessToken, orderId);
      await load(true);
      feedback.success("تم تحديث حالة الطلب إلى ملغى.", "تم الإلغاء");
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إلغاء الطلب.");
    } finally {
      setActionOrderId(null);
    }
  };

  const runResumeStuck = async (orderId: string) => {
    const session = await getSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }
    setActionOrderId(orderId);
    try {
      await coordinatorResumeStuckOrder(session.accessToken, orderId);
      await load(true);
      feedback.success("أُعيد الطلب للسائق نفسه — في الطريق إلى الزبون.", "تمت الإعادة");
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إعادة الطلب للسائق.");
    } finally {
      setActionOrderId(null);
    }
  };

  const runAssign = async (driver: DriverForAssignment) => {
    if (driver.isBusy) {
      feedback.warning("هذا السائق مشغول بطلب آخر. اختر سائقًا آخر أو انتظر.");
      return;
    }
    const session = await getSession();
    if (!session?.accessToken || !assignOrderId) {
      router.replace("/login");
      return;
    }
    setAssignSubmitting(true);
    try {
      await coordinatorAssignOrder(session.accessToken, assignOrderId, driver.id);
      setAssignModalOpen(false);
      setAssignOrderId(null);
      await load(true);
      feedback.success(`تم إسناد الطلب إلى السائق ${driver.fullName}.`, "تم الإسناد");
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إسناد الطلب.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  const openOrderChat = async (orderId: string) => {
    try {
      const room = await getOrderChatRoom(orderId);
      router.push(chatRoomHref(room) as `/chat/${string}`);
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر فتح المحادثة");
    }
  };

  const chatBtn = (orderId: string) => (
    <Pressable style={styles.btnChat} onPress={() => void openOrderChat(orderId)} accessibilityLabel="محادثة الطلب">
      <Ionicons name="chatbubble-outline" size={16} color={theme.colors.infoText} />
      <Text style={styles.btnChatText}>محادثة</Text>
    </Pressable>
  );

  const renderItem = ({ item }: { item: CoordinatorOrderRow }) => {
    const pending = item.status === "PENDING";
    const stuck = item.status === "STUCK";
    const cancelled = item.status === "CANCELLED";
    const busy = actionOrderId === item.id;

    let footer: ReactNode;
    if (cancelled) {
      footer = undefined;
    } else if (pending) {
      footer = (
        <View style={styles.actions}>
          {chatBtn(item.id)}
          <Pressable
            style={[styles.btnDanger, busy && styles.btnDisabled]}
            disabled={!!busy}
            onPress={() => confirmCancel(item.id)}
          >
            {busy ? (
              <ActivityIndicator color={theme.colors.dangerText} size="small" />
            ) : (
              <Text style={styles.btnDangerText}>إلغاء الطلب</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.btnPrimary, (busy || assignSubmitting) && styles.btnDisabled]}
            disabled={!!busy || assignSubmitting}
            onPress={() => void openAssignModal(item.id)}
          >
            <Text style={styles.btnPrimaryText}>إسناد لسائق</Text>
          </Pressable>
        </View>
      );
    } else if (stuck) {
      footer = (
        <View style={styles.actions}>
          {chatBtn(item.id)}
          <Pressable
            style={[styles.btnDanger, busy && styles.btnDisabled]}
            disabled={!!busy}
            onPress={() => confirmCancel(item.id)}
          >
            {busy ? (
              <ActivityIndicator color={theme.colors.dangerText} size="small" />
            ) : (
              <Text style={styles.btnDangerText}>إلغاء الطلب</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.btnResumeStuck, busy && styles.btnDisabled]}
            disabled={!!busy}
            onPress={() => void runResumeStuck(item.id)}
          >
            {busy ? (
              <ActivityIndicator color={theme.colors.infoText} size="small" />
            ) : (
              <Text style={styles.btnResumeStuckText}>إعادة للسائق</Text>
            )}
          </Pressable>
        </View>
      );
    } else {
      footer = <View style={styles.actions}>{chatBtn(item.id)}</View>;
    }

    return (
      <CoordinatorOrderCard
        item={item}
        footer={footer}
        coordinatorFullName={coordinatorFullName}
        onOrderUpdated={(row) => {
          setOrders((prev) => prev.map((o) => (o.id === row.id ? row : o)));
          void load(true);
        }}
      />
    );
  };

  if (loading && orders.length === 0) {
    return (
      <View style={[styles.centered, { paddingTop: 12 }]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>جاري تحميل طلباتك…</Text>
      </View>
    );
  }

  const listBottomPad = coordinatorTabBarOuterHeight(insets.bottom) + 24;

  const renderFilterChip = ({ key, label, countKey }: OrderFilterDef) => {
    const active = key === null ? listSegment === null : listSegment === key;
    const count = filterCounts[countKey];
    return (
      <Pressable
        key={key ?? "all"}
        onPress={() => setListSegment(key)}
        style={({ pressed }) => [
          styles.filterChip,
          active && styles.filterChipActive,
          pressed && styles.filterChipPressed
        ]}
      >
        {count > 0 ? (
          <View style={[styles.filterBadge, active && styles.filterBadgeActive]}>
            <Text style={[styles.filterBadgeText, active && styles.filterBadgeTextActive]}>
              {count > 99 ? "99+" : String(count)}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: 8 }]}>
      <Text style={styles.title}>طلباتي</Text>
     

      <View style={styles.filterPanel}>
        {ORDER_FILTER_ROWS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.filterRow}>
            {row.map(renderFilterChip)}
          </View>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          orders.length === 0
            ? [styles.emptyList, { paddingBottom: listBottomPad }]
            : [styles.list, { paddingBottom: listBottomPad }]
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.accent} />}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.listFooterLoader}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {EMPTY_FILTER_MESSAGES[listSegment ?? "all"]}
          </Text>
        }
      />
      <Modal visible={assignModalOpen} animationType="slide" transparent onRequestClose={() => !assignSubmitting && setAssignModalOpen(false)}>
        <KeyboardAvoidingView trustSystemResize behavior="padding" style={[styles.modalRoot, styles.rtlScreen]}>
          <Pressable style={styles.modalBackdrop} onPress={() => !assignSubmitting && setAssignModalOpen(false)} />
          <View style={[styles.modalSheet, styles.rtlScreen, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.assignScrollContent}
            >
              <Text style={styles.modalTitle}>اختر سائقًا</Text>
              <Text style={styles.modalHint}>ابدأ بالكتابة (حرفان على الأقل) — البحث يُنفَّذ بعد توقف الكتابة قليلًا</Text>
              <TextInput
                value={assignQuery}
                onChangeText={setAssignQuery}
                placeholder="اسم السائق أو جزء من الهاتف…"
                placeholderTextColor={theme.colors.placeholder}
                style={styles.searchInput}
                editable={!assignSubmitting}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {assignLoading ? (
                <ActivityIndicator style={styles.modalLoading} color={theme.colors.accent} size="large" />
              ) : assignDrivers.length > 0 ? (
                <View style={styles.assignDriversWrap}>
                  {assignDrivers.map((d) => (
                    <Pressable
                      key={d.id}
                      style={[styles.driverRow, d.isBusy && styles.driverRowDisabled]}
                      disabled={assignSubmitting || d.isBusy}
                      onPress={() => void runAssign(d)}
                    >
                      <Text style={styles.driverName}>{d.fullName || "سائق"}</Text>
                      <Text style={styles.driverMeta}>
                        {d.phone ?? "—"} · {d.isOnline ? "متصل" : "غير متصل"}
                        {d.isBusy ? " · مشغول" : ""}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.noDrivers}>
                  {assignQuery.trim().length < 2
                    ? "اكتب حرفين على الأقل للبحث عن سائق."
                    : "لا يوجد سائق يطابق البحث."}
                </Text>
              )}
              <Pressable
                style={[styles.modalClose, assignSubmitting && styles.btnDisabled]}
                disabled={assignSubmitting}
                onPress={() => setAssignModalOpen(false)}
              >
                <Text style={styles.modalCloseText}>إغلاق</Text>
              </Pressable>
              {assignSubmitting ? <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 8 }} /> : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

