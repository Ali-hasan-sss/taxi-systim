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
import { CoordinatorCreateOrderModal } from "../../src/components/CoordinatorCreateOrderModal";
import { coordinatorTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { io, type Socket } from "socket.io-client";
import { CoordinatorOrderCard } from "../../src/components/CoordinatorOrderCard";
import {
  type CoordinatorActiveOrdersSegment,
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
import { playOrderStuckSound } from "../../src/lib/order-stuck-sound";
import { clearSession, getSession } from "../../src/lib/session";
import { useCoordinatorStore } from "../../src/store";
import { rtlText } from "../../src/lib/rtl-text";

export default function OrdersTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setStuckOrdersCount = useCoordinatorStore((s) => s.setStuckOrdersCount);
  const [orders, setOrders] = useState<CoordinatorOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myCoordinatorId, setMyCoordinatorId] = useState<string | null>(null);
  const [actionOrderId, setActionOrderId] = useState<string | null>(null);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);

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
      setOrders(page.orders);
      setNextCursor(page.nextCursor);
      setStuckOrdersCount(stats.stuckActive ?? 0);
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
        if (p?.status === "STUCK" && cid && p.coordinatorId === cid) {
          void playOrderStuckSound();
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

  const renderItem = ({ item }: { item: CoordinatorOrderRow }) => {
    const pending = item.status === "PENDING";
    const stuck = item.status === "STUCK";
    const busy = actionOrderId === item.id;

    let footer: ReactNode;
    if (pending) {
      footer = (
        <View style={styles.actions}>
          <Pressable
            style={[styles.btnDanger, busy && styles.btnDisabled]}
            disabled={!!busy}
            onPress={() => confirmCancel(item.id)}
          >
            {busy ? (
              <ActivityIndicator color="#fecaca" size="small" />
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
          <Pressable
            style={[styles.btnDanger, busy && styles.btnDisabled]}
            disabled={!!busy}
            onPress={() => confirmCancel(item.id)}
          >
            {busy ? (
              <ActivityIndicator color="#fecaca" size="small" />
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
              <ActivityIndicator color="#e0f2fe" size="small" />
            ) : (
              <Text style={styles.btnResumeStuckText}>إعادة للسائق</Text>
            )}
          </Pressable>
        </View>
      );
    } else {
      footer = undefined;
    }

    return <CoordinatorOrderCard item={item} footer={footer} />;
  };

  if (loading && orders.length === 0) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>جاري تحميل طلباتك…</Text>
      </View>
    );
  }

  const listBottomPad = coordinatorTabBarOuterHeight(insets.bottom) + 24;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>طلباتي</Text>
      <Text style={styles.subtitle}>
        صفِّ حسب الحالة. المكتملة والملغاة في الأرشيف. مرّر للأسفل لتحميل المزيد (10 لكل دفعة).
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        style={styles.filterScrollView}
      >
        {(
          [
            { key: "all" as const, label: "الكل" },
            { key: "pending" as const, label: "معلقة" },
            { key: "in_progress" as const, label: "في الطريق" },
            { key: "stuck" as const, label: "متعثرة" }
          ] as const
        ).map(({ key, label }) => {
          const active = key === "all" ? listSegment === null : listSegment === key;
          return (
            <Pressable
              key={key}
              onPress={() => setListSegment(key === "all" ? null : key)}
              style={({ pressed }) => [
                styles.filterChip,
                active && styles.filterChipActive,
                pressed && styles.filterChipPressed
              ]}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#38bdf8" />}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.listFooterLoader}>
              <ActivityIndicator color="#38bdf8" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {listSegment === null
              ? "لا توجد طلبات نشطة. أنشئ طلبًا من الشاشة الرئيسية."
              : listSegment === "pending"
                ? "لا توجد طلبات معلقة ضمن هذا التصفية."
                : listSegment === "in_progress"
                  ? "لا توجد طلبات في الطريق ضمن هذا التصفية."
                  : "لا توجد طلبات متعثرة ضمن هذا التصفية."}
          </Text>
        }
      />
      <Pressable
        style={[styles.fab, { bottom: coordinatorTabBarOuterHeight(insets.bottom) + 12 }]}
        onPress={() => setCreateOrderOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="إضافة طلب جديد"
      >
        <Text style={styles.fabPlus}>+</Text>
        <Text style={styles.fabText}>طلب جديد</Text>
      </Pressable>

      <Modal visible={assignModalOpen} animationType="slide" transparent onRequestClose={() => !assignSubmitting && setAssignModalOpen(false)}>
        <View style={[styles.modalRoot, styles.rtlScreen]}>
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
                placeholderTextColor="#64748b"
                style={styles.searchInput}
                editable={!assignSubmitting}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {assignLoading ? (
                <ActivityIndicator style={styles.modalLoading} color="#38bdf8" size="large" />
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
              {assignSubmitting ? <ActivityIndicator color="#38bdf8" style={{ marginTop: 8 }} /> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <CoordinatorCreateOrderModal
        visible={createOrderOpen}
        onClose={() => setCreateOrderOpen(false)}
        onCreated={async () => {
          await load(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rtlScreen: {
    direction: "rtl",
    alignItems: "stretch"
  },
  root: {
    flex: 1,
    backgroundColor: "#0f172a",
    direction: "rtl"
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f172a",
    paddingHorizontal: 24
  },
  loadingText: {
    marginTop: 12,
    color: "#94a3b8",
    fontSize: 15,
    ...rtlText,
    width: "100%"
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText,
    marginBottom: 8,
    paddingHorizontal: 20
  },
  subtitle: {
    fontSize: 13,
    color: "#94a3b8",
    ...rtlText,
    lineHeight: 20,
    marginBottom: 10,
    paddingHorizontal: 20
  },
  filterScrollView: {
    flexGrow: 0,
    marginBottom: 12
  },
  filterScroll: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 4,
    alignItems: "center"
  },
  filterChip: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44
  },
  filterChipActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#3b82f6"
  },
  filterChipPressed: {
    opacity: 0.9
  },
  filterChipText: {
    color: "#94a3b8",
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 22,
    ...rtlText,
    ...Platform.select({ android: { includeFontPadding: false }, default: {} })
  },
  filterChipTextActive: {
    color: "#eff6ff"
  },
  error: {
    color: "#f87171",
    ...rtlText,
    paddingHorizontal: 20,
    marginBottom: 8
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
  listFooterLoader: {
    paddingVertical: 20,
    alignItems: "center"
  },
  fab: {
    position: "absolute",
    end: 20,
    minWidth: 132,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2563eb",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 10
  },
  fabPlus: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 24
  },
  fabText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    ...rtlText
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-start",
    flexWrap: "wrap",
    marginTop: 4
  },
  btnDanger: {
    backgroundColor: "#7f1d1d",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 120,
    alignItems: "center"
  },
  btnDangerText: {
    color: "#fecaca",
    fontWeight: "800",
    fontSize: 14,
    ...rtlText
  },
  btnPrimary: {
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 120,
    alignItems: "center"
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    ...rtlText
  },
  btnResumeStuck: {
    backgroundColor: "#0369a1",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 120,
    alignItems: "center"
  },
  btnResumeStuckText: {
    color: "#e0f2fe",
    fontWeight: "800",
    fontSize: 14,
    ...rtlText
  },
  btnDisabled: {
    opacity: 0.55
  },
  empty: {
    color: "#64748b",
    ...rtlText,
    marginTop: 40,
    fontSize: 15,
    lineHeight: 24
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  modalSheet: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    maxHeight: "85%",
    minHeight: 280,
    borderWidth: 1,
    borderColor: "#334155"
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText,
    marginBottom: 6
  },
  modalHint: {
    fontSize: 12,
    color: "#94a3b8",
    ...rtlText,
    marginBottom: 12
  },
  searchInput: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f8fafc",
    marginBottom: 12,
    ...rtlText
  },
  assignScrollContent: {
    alignItems: "stretch",
    paddingBottom: 8
  },
  modalLoading: {
    marginVertical: 32,
    minHeight: 120
  },
  assignDriversWrap: {
    marginTop: 4
  },
  driverFlatList: {
    flexGrow: 0,
    maxHeight: 380,
    marginTop: 4
  },
  driverRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "stretch"
  },
  driverRowDisabled: {
    opacity: 0.45
  },
  driverName: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 16,
    ...rtlText
  },
  driverMeta: {
    color: "#94a3b8",
    fontSize: 12,
    ...rtlText,
    marginTop: 4
  },
  noDrivers: {
    color: "#64748b",
    ...rtlText,
    paddingVertical: 16
  },
  modalClose: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 12
  },
  modalCloseText: {
    color: "#38bdf8",
    fontWeight: "800",
    fontSize: 16,
    ...rtlText
  }
});
