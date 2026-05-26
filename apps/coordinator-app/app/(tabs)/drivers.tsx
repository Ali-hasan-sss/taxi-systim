import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { io, type Socket } from "socket.io-client";
import {
  coordinatorAssignOrder,
  coordinatorCreateOrder,
  coordinatorLiveDrivers,
  getSocketOrigin,
  type LiveDriverDto,
  type LiveDriverStatusFilter
} from "../../src/lib/api";
import { feedback } from "../../src/lib/feedback";
import { clearSession, getSession } from "../../src/lib/session";
import { rtlText } from "../../src/lib/rtl-text";
import { buildWhatsAppChatUrl } from "../../src/lib/whatsapp";

const LIVE_PAGE_SIZE = 20;
const STATUS_FILTERS: Array<{ id: LiveDriverStatusFilter; label: string }> = [
  { id: "all", label: "الكل" },
  { id: "available", label: "المتاحون" },
  { id: "busy", label: "المشغولون" }
];

type SocketUiStatus = "connected" | "connecting" | "disconnected";
type LoadMode = "initial" | "refresh" | "more";

function isFiniteCoord(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function hasDriverLocation(driver: LiveDriverDto): driver is LiveDriverDto & { lat: number; lng: number } {
  return isFiniteCoord(driver.lat) && isFiniteCoord(driver.lng) && Math.abs(driver.lat) <= 90 && Math.abs(driver.lng) <= 180;
}

function normalizeDriver(driver: LiveDriverDto): LiveDriverDto {
  return {
    ...driver,
    lat: hasDriverLocation(driver) ? driver.lat : null,
    lng: hasDriverLocation(driver) ? driver.lng : null,
    isBusy: driver.isBusy === true
  };
}

function DriverListItem(props: {
  driver: LiveDriverDto;
  onAssign: () => void;
  onWhatsApp: () => void;
  onOpenMaps: () => void;
}) {
  const { driver, onAssign, onWhatsApp, onOpenMaps } = props;
  const busy = driver.isBusy === true;
  const hasLocation = hasDriverLocation(driver);
  const hasPhone = !!buildWhatsAppChatUrl(driver.phone);
  const initial = driver.fullName?.trim().replace(/\s/g, "").charAt(0) || "س";

  return (
    <View style={styles.driverCard}>
      <View style={styles.driverCardHeader}>
        <View style={[styles.driverAvatar, busy ? styles.driverAvatarBusy : styles.driverAvatarFree]}>
          <Text style={styles.driverAvatarText}>{initial}</Text>
        </View>
        <View style={styles.driverMainInfo}>
          <Text style={styles.driverName} numberOfLines={2}>
            {driver.fullName?.trim() || "سائق"}
          </Text>
          <View style={[styles.statusPill, busy ? styles.statusPillBusy : styles.statusPillFree]}>
            <View style={[styles.statusDot, busy ? styles.statusDotBusy : styles.statusDotFree]} />
            <Text style={styles.statusPillText}>{busy ? "مشغول الآن" : "متاح الآن"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.driverMetaBlock}>
        <Text style={styles.driverMetaLabel}>الهاتف</Text>
        <Text style={styles.driverMetaValue}>{driver.phone || "لا يوجد رقم مسجّل"}</Text>
      </View>

      <View style={styles.driverMetaBlock}>
        <Text style={styles.driverMetaLabel}>الموقع</Text>
        <Text style={styles.driverMetaValue}>{hasLocation ? "متوفر لفتحه في خرائط جوجل" : "لم يصل موقع بعد"}</Text>
      </View>

      <View style={styles.driverActions}>
        <Pressable
          style={[styles.actionBtn, styles.mapBtn, !hasLocation && styles.actionBtnDisabled]}
          disabled={!hasLocation}
          onPress={onOpenMaps}
        >
          <Ionicons name="navigate-outline" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>الموقع</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.whatsAppBtn, !hasPhone && styles.actionBtnDisabled]}
          disabled={!hasPhone}
          onPress={onWhatsApp}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>واتساب</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.assignBtn, busy && styles.actionBtnDisabled]}
          disabled={busy}
          onPress={onAssign}
        >
          <Ionicons name="clipboard-outline" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>إسناد طلب</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DriversTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requestSeq = useRef(0);
  const loadedCountRef = useRef(0);
  const filtersMountedRef = useRef(false);

  const [drivers, setDrivers] = useState<LiveDriverDto[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketUiStatus>("connecting");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LiveDriverStatusFilter>("all");

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDriver, setQuickDriver] = useState<LiveDriverDto | null>(null);
  const [quickFrom, setQuickFrom] = useState("");
  const [quickTo, setQuickTo] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    loadedCountRef.current = drivers.length;
  }, [drivers.length]);

  const fetchDrivers = useCallback(
    async ({ offset, limit, mode, append }: { offset: number; limit: number; mode: LoadMode; append: boolean }) => {
      const currentRequest = ++requestSeq.current;
      const session = await getSession();
      if (!session?.accessToken) {
        router.replace("/login");
        return;
      }

      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      if (mode === "more") setLoadingMore(true);
      if (offset === 0) setError(null);

      try {
        const page = await coordinatorLiveDrivers(session.accessToken, {
          q: debouncedSearch,
          status: statusFilter,
          limit,
          offset
        });
        if (currentRequest !== requestSeq.current) return;
        const normalized = page.drivers.map(normalizeDriver);
        setDrivers((prev) => (append ? [...prev, ...normalized] : normalized));
        setTotal(page.total);
        setNextOffset(page.nextOffset);
      } catch (e) {
        if (currentRequest !== requestSeq.current) return;
        const msg = e instanceof Error ? e.message : "حدث خطأ";
        setError(msg);
        if (msg.includes("Unauthorized") || msg.includes("غير مصرح") || msg.includes("Forbidden")) {
          await clearSession();
          router.replace("/login");
        }
      } finally {
        if (currentRequest === requestSeq.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [debouncedSearch, router, statusFilter]
  );

  const refreshList = useCallback(
    (mode: "initial" | "refresh" = "refresh") => {
      const limit = mode === "initial" ? LIVE_PAGE_SIZE : Math.max(LIVE_PAGE_SIZE, loadedCountRef.current || LIVE_PAGE_SIZE);
      void fetchDrivers({ offset: 0, limit, mode, append: false });
    },
    [fetchDrivers]
  );

  const loadMore = useCallback(() => {
    if (nextOffset == null || loading || refreshing || loadingMore) return;
    void fetchDrivers({ offset: nextOffset, limit: LIVE_PAGE_SIZE, mode: "more", append: true });
  }, [fetchDrivers, loading, loadingMore, nextOffset, refreshing]);

  useFocusEffect(
    useCallback(() => {
      refreshList("initial");
    }, [refreshList])
  );

  useEffect(() => {
    if (!filtersMountedRef.current) {
      filtersMountedRef.current = true;
      return;
    }
    refreshList("initial");
  }, [debouncedSearch, refreshList, statusFilter]);

  useEffect(() => {
    const origin = getSocketOrigin();
    setSocketStatus("connecting");
    const socket: Socket = io(origin, { transports: ["websocket"] });

    const onConnect = () => setSocketStatus("connected");
    const onDisconnect = (reason: string) => {
      if (reason === "io client disconnect") return;
      setSocketStatus(reason === "io server disconnect" ? "disconnected" : "connecting");
    };
    const onReconnectAttempt = () => setSocketStatus("connecting");
    const onReconnectFailed = () => setSocketStatus("disconnected");

    const onLoc = (payload: { driverId?: string; lat?: number; lng?: number; isBusy?: boolean }) => {
      if (!payload?.driverId || !isFiniteCoord(payload.lat) || !isFiniteCoord(payload.lng)) return;
      if (Math.abs(payload.lat) > 90 || Math.abs(payload.lng) > 180) return;
      setDrivers((prev) =>
        prev.map((driver) =>
          driver.driverId === payload.driverId
            ? {
                ...driver,
                lat: payload.lat!,
                lng: payload.lng!,
                isBusy: typeof payload.isBusy === "boolean" ? payload.isBusy : driver.isBusy
              }
            : driver
        )
      );
    };

    const onOnline = () => refreshList("refresh");
    const onOffline = (payload: { driverId?: string }) => {
      if (!payload?.driverId) return;
      setDrivers((prev) => prev.filter((driver) => driver.driverId !== payload.driverId));
      setTotal((prev) => Math.max(0, prev - 1));
      refreshList("refresh");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect_failed", onReconnectFailed);
    socket.on("DRIVER_LOCATION_UPDATED", onLoc);
    socket.on("DRIVER_ONLINE", onOnline);
    socket.on("DRIVER_OFFLINE", onOffline);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect_failed", onReconnectFailed);
      socket.off("DRIVER_LOCATION_UPDATED", onLoc);
      socket.off("DRIVER_ONLINE", onOnline);
      socket.off("DRIVER_OFFLINE", onOffline);
      socket.disconnect();
    };
  }, [refreshList]);

  const openQuickOrderSheet = (driver: LiveDriverDto) => {
    setQuickDriver(driver);
    setQuickFrom("");
    setQuickTo("");
    setQuickPhone("");
    setQuickAmount("");
    setQuickOpen(true);
  };

  const closeQuickOrder = () => {
    if (quickSubmitting) return;
    setQuickOpen(false);
    setQuickDriver(null);
  };

  const submitQuickOrder = async () => {
    if (!quickDriver) return;
    if (quickDriver.isBusy) {
      feedback.warning("السائق مشغول برحلة حاليًا. انتظر حتى يصبح متاحًا.");
      return;
    }

    const session = await getSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }

    const amount = Number(quickAmount.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      feedback.warning("أدخل تكلفة صالحة أكبر من صفر.");
      return;
    }
    if (!quickFrom.trim() || !quickTo.trim()) {
      feedback.warning("أدخل عنوان الانطلاق والوجهة.");
      return;
    }
    if (quickPhone.trim().length < 3) {
      feedback.warning("أدخل رقم زبون (3 أرقام على الأقل).");
      return;
    }

    setQuickSubmitting(true);
    try {
      const created = await coordinatorCreateOrder(session.accessToken, {
        pickupAddress: quickFrom.trim(),
        dropoffAddress: quickTo.trim(),
        customerPhone: quickPhone.trim(),
        amount,
        broadcastTarget: "ALL"
      });
      await coordinatorAssignOrder(session.accessToken, created.id, quickDriver.driverId);
      feedback.success(`تم إنشاء الطلب وإسناده إلى ${quickDriver.fullName}.`, "تم الإسناد");
      closeQuickOrder();
      refreshList("refresh");
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إتمام الطلب.");
    } finally {
      setQuickSubmitting(false);
    }
  };

  const openWhatsApp = async (driver: LiveDriverDto) => {
    const url = buildWhatsAppChatUrl(driver.phone);
    if (!url) {
      feedback.info("لا يوجد رقم هاتف مسجّل لهذا السائق.", "واتساب");
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      feedback.error("تعذر فتح واتساب.");
    }
  };

  const openGoogleMaps = async (driver: LiveDriverDto) => {
    if (!hasDriverLocation(driver)) {
      feedback.info("لم يصل موقع لهذا السائق بعد.", "خرائط جوجل");
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${driver.lat},${driver.lng}`;
    try {
      await Linking.openURL(url);
    } catch {
      feedback.error("تعذر فتح خرائط جوجل.");
    }
  };

  const socketDotColor =
    socketStatus === "connected" ? "#22c55e" : socketStatus === "connecting" ? "#f97316" : "#ef4444";
  const socketLabel =
    socketStatus === "connected"
      ? "متصل — قائمة السائقين تتحدث تلقائيًا"
      : socketStatus === "connecting"
        ? "جاري الاتصال…"
        : "غير متصل";

  return (
    <View style={styles.root}>
      <View style={[styles.socketBar, { paddingTop: insets.top + 8 }]}>
        <View style={[styles.socketDot, { backgroundColor: socketDotColor }]} />
        <Text style={styles.socketBarText}>{socketLabel}</Text>
      </View>

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>السائقون المتصلون</Text>
            <Text style={styles.headerHint}>قائمة فقط بدون خريطة. افتح موقع السائق عبر خرائط جوجل عند الحاجة.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
          <Pressable onPress={() => refreshList("refresh")} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={18} color="#e2e8f0" />
            <Text style={styles.refreshBtnText}>تحديث</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#64748b" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث عن سائق بالاسم أو الهاتف"
            placeholderTextColor="#64748b"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => {
            const active = statusFilter === filter.id;
            return (
              <Pressable
                key={filter.id}
                onPress={() => setStatusFilter(filter.id)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading && drivers.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>جاري تحميل السائقين المتصلين…</Text>
        </View>
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={(item) => item.driverId}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 12) + 96 },
            drivers.length === 0 && styles.listContentEmpty
          ]}
          refreshing={refreshing}
          onRefresh={() => refreshList("refresh")}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <DriverListItem
              driver={item}
              onAssign={() => openQuickOrderSheet(item)}
              onWhatsApp={() => void openWhatsApp(item)}
              onOpenMaps={() => void openGoogleMaps(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={42} color="#475569" />
              <Text style={styles.emptyTitle}>{debouncedSearch ? "لا توجد نتائج" : "لا يوجد سائقون متصلون"}</Text>
              <Text style={styles.emptyHint}>
                {debouncedSearch ? "جرّب اسمًا مختلفًا أو امسح البحث." : "سيظهر هنا فقط السائقون المتصلون حاليًا."}
              </Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.footerWrap}>
              {loadingMore ? (
                <ActivityIndicator color="#38bdf8" />
              ) : nextOffset != null ? (
                <Pressable onPress={loadMore} style={styles.loadMoreBtn}>
                  <Text style={styles.loadMoreBtnText}>تحميل 20 أخرى</Text>
                </Pressable>
              ) : drivers.length > 0 ? (
                <Text style={styles.footerHint}>تم عرض جميع السائقين المتصلين.</Text>
              ) : null}
            </View>
          }
        />
      )}

      <Modal visible={quickOpen} animationType="slide" transparent onRequestClose={closeQuickOrder}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.quickModalRoot}>
          <Pressable style={styles.quickBackdrop} onPress={closeQuickOrder} />
          <View style={[styles.quickSheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <Text style={styles.quickTitle}>طلب سريع للسائق</Text>
            {quickDriver ? (
              <Text style={styles.quickSubtitle}>
                {quickDriver.fullName}
                {quickDriver.isBusy ? " — مشغول (لا يمكن الإسناد الآن)" : ""}
              </Text>
            ) : null}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.quickScroll}
            >
              <Text style={styles.quickLabel}>من (الانطلاق)</Text>
              <TextInput
                value={quickFrom}
                onChangeText={setQuickFrom}
                placeholder="عنوان الانطلاق"
                placeholderTextColor="#64748b"
                style={styles.quickInput}
                editable={!quickSubmitting}
              />
              <Text style={styles.quickLabel}>إلى (الوجهة)</Text>
              <TextInput
                value={quickTo}
                onChangeText={setQuickTo}
                placeholder="عنوان الوجهة"
                placeholderTextColor="#64748b"
                style={styles.quickInput}
                editable={!quickSubmitting}
              />
              <Text style={styles.quickLabel}>هاتف الزبون</Text>
              <TextInput
                value={quickPhone}
                onChangeText={setQuickPhone}
                placeholder="07xxxxxxxx"
                placeholderTextColor="#64748b"
                style={styles.quickInput}
                keyboardType="phone-pad"
                editable={!quickSubmitting}
              />
              <Text style={styles.quickLabel}>التكلفة</Text>
              <TextInput
                value={quickAmount}
                onChangeText={setQuickAmount}
                placeholder="مثال: 25"
                placeholderTextColor="#64748b"
                style={styles.quickInput}
                keyboardType="decimal-pad"
                editable={!quickSubmitting}
              />
              <Text style={styles.quickHint}>يُنشأ الطلب ثم يُسند مباشرة لهذا السائق المتصل.</Text>
            </ScrollView>
            <View style={styles.quickFooterBtns}>
              <Pressable
                style={[styles.quickCancelBtn, quickSubmitting && styles.actionBtnDisabled]}
                disabled={quickSubmitting}
                onPress={closeQuickOrder}
              >
                <Text style={styles.quickCancelBtnText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={[styles.quickSaveBtn, (quickSubmitting || quickDriver?.isBusy) && styles.actionBtnDisabled]}
                disabled={quickSubmitting || !!quickDriver?.isBusy}
                onPress={() => void submitQuickOrder()}
              >
                {quickSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.quickSaveBtnText}>إنشاء وإسناد</Text>}
              </Pressable>
            </View>
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
    direction: "rtl"
  },
  socketBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "#020617",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b"
  },
  socketDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  socketBarText: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "700",
    ...rtlText
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    gap: 12
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  headerText: {
    flex: 1
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "800",
    ...rtlText
  },
  headerHint: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
    ...rtlText
  },
  error: {
    marginTop: 8,
    color: "#f87171",
    fontSize: 12,
    ...rtlText
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#334155"
  },
  refreshBtnText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "800",
    ...rtlText
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155"
  },
  filterChipActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb"
  },
  filterChipText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "800",
    ...rtlText
  },
  filterChipTextActive: {
    color: "#fff"
  },
  searchInput: {
    flex: 1,
    color: "#f8fafc",
    fontSize: 15,
    minHeight: 42,
    ...rtlText
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12
  },
  loadingText: {
    color: "#cbd5e1",
    fontSize: 14,
    ...rtlText
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: "center"
  },
  driverCard: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 18,
    padding: 16,
    gap: 12
  },
  driverCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  driverAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2
  },
  driverAvatarFree: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderColor: "#22c55e"
  },
  driverAvatarBusy: {
    backgroundColor: "rgba(234, 88, 12, 0.12)",
    borderColor: "#ea580c"
  },
  driverAvatarText: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "800"
  },
  driverMainInfo: {
    flex: 1,
    minWidth: 0
  },
  driverName: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 8,
    ...rtlText
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999
  },
  statusPillFree: {
    backgroundColor: "rgba(34, 197, 94, 0.14)"
  },
  statusPillBusy: {
    backgroundColor: "rgba(234, 88, 12, 0.14)"
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  statusDotFree: {
    backgroundColor: "#22c55e"
  },
  statusDotBusy: {
    backgroundColor: "#ea580c"
  },
  statusPillText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "800",
    ...rtlText
  },
  driverMetaBlock: {
    gap: 4
  },
  driverMetaLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    ...rtlText
  },
  driverMetaValue: {
    color: "#cbd5e1",
    fontSize: 14,
    ...rtlText
  },
  driverActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  actionBtn: {
    flex: 1,
    minWidth: 92,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12
  },
  mapBtn: {
    backgroundColor: "#0f766e"
  },
  whatsAppBtn: {
    backgroundColor: "#15803d"
  },
  assignBtn: {
    backgroundColor: "#2563eb"
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    ...rtlText
  },
  actionBtnDisabled: {
    opacity: 0.45
  },
  emptyState: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 24
  },
  emptyTitle: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "800",
    ...rtlText
  },
  emptyHint: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    ...rtlText
  },
  footerWrap: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center"
  },
  loadMoreBtn: {
    backgroundColor: "#1d4ed8",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  loadMoreBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    ...rtlText
  },
  footerHint: {
    color: "#64748b",
    fontSize: 12,
    ...rtlText
  },
  quickModalRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  quickBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)"
  },
  quickSheet: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
    maxHeight: "88%"
  },
  quickTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText,
    marginBottom: 6
  },
  quickSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    ...rtlText,
    marginBottom: 12
  },
  quickScroll: {
    paddingBottom: 12
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#cbd5e1",
    ...rtlText,
    marginBottom: 6,
    marginTop: 10
  },
  quickInput: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f8fafc",
    fontSize: 15,
    ...rtlText
  },
  quickHint: {
    marginTop: 12,
    fontSize: 12,
    color: "#64748b",
    ...rtlText,
    lineHeight: 18
  },
  quickFooterBtns: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8
  },
  quickCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#334155",
    alignItems: "center"
  },
  quickCancelBtnText: {
    color: "#e2e8f0",
    fontWeight: "800",
    fontSize: 15,
    ...rtlText
  },
  quickSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    alignItems: "center"
  },
  quickSaveBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    ...rtlText
  }
});
