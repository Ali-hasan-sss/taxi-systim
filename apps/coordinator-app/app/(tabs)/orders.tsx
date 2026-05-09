import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { io, type Socket } from "socket.io-client";
import { CoordinatorOrderCard } from "../../src/components/CoordinatorOrderCard";
import {
  type CoordinatorOrderRow,
  type DriverForAssignment,
  coordinatorAssignOrder,
  coordinatorCancelOrder,
  coordinatorSearchDriversForAssignment,
  coordinatorListOrders,
  coordinatorMe,
  getSocketOrigin
} from "../../src/lib/api";
import { feedback } from "../../src/lib/feedback";
import { clearSession, getSession } from "../../src/lib/session";

export default function OrdersTab() {
  const router = useRouter();
  const [orders, setOrders] = useState<CoordinatorOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myCoordinatorId, setMyCoordinatorId] = useState<string | null>(null);
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
      const [me, page] = await Promise.all([
        coordinatorMe(session.accessToken),
        coordinatorListOrders(session.accessToken, "active")
      ]);
      setMyCoordinatorId(me.coordinatorId);
      setOrders(page.orders);
      setNextCursor(page.nextCursor);
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
  }, [router]);

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
      const page = await coordinatorListOrders(session.accessToken, "active", { cursor: nextCursor });
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
  }, [nextCursor, loading, refreshing, router]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  useEffect(() => {
    const origin = getSocketOrigin();
    let socket: Socket | null = null;
    try {
      socket = io(origin, { transports: ["websocket"] });
      const maybeReload = (payload: { coordinatorId?: string }) => {
        if (!myCoordinatorId) {
          void load(true);
          return;
        }
        if (payload?.coordinatorId === myCoordinatorId) {
          void load(true);
        }
      };
      socket.on("NEW_ORDER", maybeReload);
      socket.on("ORDER_ASSIGNED", maybeReload);
    } catch {
      /* ignore */
    }
    return () => {
      socket?.disconnect();
    };
  }, [myCoordinatorId, load]);

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
    const busy = actionOrderId === item.id;

    return (
      <CoordinatorOrderCard
        item={item}
        footer={
          pending ? (
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
          ) : undefined
        }
      />
    );
  };

  if (loading && orders.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>جاري تحميل طلباتك…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>طلباتي</Text>
      <Text style={styles.subtitle}>
        الطلبات النشطة فقط (يحددها الخادم). المكتملة والملغاة في تبويب الأرشيف. مرّر للأسفل لتحميل المزيد (10 لكل
        دفعة). للطلب المعلق: إلغاء أو إسناد لسائق.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={orders.length === 0 ? styles.emptyList : styles.list}
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
          <Text style={styles.empty}>لا توجد طلبات نشطة. أنشئ طلبًا من تبويب الرئيسية.</Text>
        }
      />

      <Modal visible={assignModalOpen} animationType="slide" transparent onRequestClose={() => !assignSubmitting && setAssignModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => !assignSubmitting && setAssignModalOpen(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>اختر سائقًا</Text>
            <Text style={styles.modalHint}>ابدأ بالكتابة (حرفان على الأقل) — البحث يُنفَّذ بعد توقف الكتابة قليلًا</Text>
            <TextInput
              value={assignQuery}
              onChangeText={setAssignQuery}
              placeholder="اسم السائق أو جزء من الهاتف…"
              placeholderTextColor="#64748b"
              style={styles.searchInput}
              textAlign="right"
              editable={!assignSubmitting}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {assignLoading ? (
              <ActivityIndicator style={styles.modalLoading} color="#38bdf8" size="large" />
            ) : (
              <FlatList
                data={assignDrivers}
                keyExtractor={(item) => item.id}
                style={styles.driverFlatList}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                renderItem={({ item: d }) => (
                  <Pressable
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
                )}
                ListEmptyComponent={
                  <Text style={styles.noDrivers}>
                    {assignQuery.trim().length < 2
                      ? "اكتب حرفين على الأقل للبحث عن سائق."
                      : "لا يوجد سائق يطابق البحث."}
                  </Text>
                }
              />
            )}
            <Pressable
              style={[styles.modalClose, assignSubmitting && styles.btnDisabled]}
              disabled={assignSubmitting}
              onPress={() => setAssignModalOpen(false)}
            >
              <Text style={styles.modalCloseText}>إغلاق</Text>
            </Pressable>
            {assignSubmitting ? <ActivityIndicator color="#38bdf8" style={{ marginTop: 8 }} /> : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingTop: 56
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
    fontSize: 15
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#f8fafc",
    textAlign: "right",
    marginBottom: 8,
    paddingHorizontal: 20
  },
  subtitle: {
    fontSize: 13,
    color: "#94a3b8",
    textAlign: "right",
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 20
  },
  error: {
    color: "#f87171",
    textAlign: "right",
    paddingHorizontal: 20,
    marginBottom: 8
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32
  },
  emptyList: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 32
  },
  listFooterLoader: {
    paddingVertical: 20,
    alignItems: "center"
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
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
    fontSize: 14
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
    fontSize: 14
  },
  btnDisabled: {
    opacity: 0.55
  },
  empty: {
    color: "#64748b",
    textAlign: "center",
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
    paddingBottom: 28,
    maxHeight: "85%",
    minHeight: 280,
    borderWidth: 1,
    borderColor: "#334155"
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f8fafc",
    textAlign: "right",
    marginBottom: 6
  },
  modalHint: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "right",
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
    marginBottom: 12
  },
  modalLoading: {
    marginVertical: 32,
    minHeight: 120
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
    borderColor: "#334155"
  },
  driverRowDisabled: {
    opacity: 0.45
  },
  driverName: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 16,
    textAlign: "right"
  },
  driverMeta: {
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "right",
    marginTop: 4
  },
  noDrivers: {
    color: "#64748b",
    textAlign: "center",
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
    fontSize: 16
  }
});
