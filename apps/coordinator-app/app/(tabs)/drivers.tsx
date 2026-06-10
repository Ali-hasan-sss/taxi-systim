import { useTheme, useThemedStyles, KeyboardAvoidingView } from "@taxi/expo-theme";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { chatRoomHref, getGlobalChatRoom } from "../../src/lib/chat";
import { rtlRow, rtlText } from "../../src/lib/rtl-text";
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
  onChat: () => void;
  onWhatsApp: () => void;
  onOpenMaps: () => void;
}) {
  const { driver, onAssign, onChat, onWhatsApp, onOpenMaps } = props;
  const { theme } = useTheme();
  const styles = useThemedStyles((t) => ({
    driverCard: {
      backgroundColor: t.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 18,
      padding: 16,
      gap: 12,
      direction: "rtl" as const,
      alignItems: "stretch" as const
    },
    driverCardHeader: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      gap: 12
    },
    driverAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 2
    },
    driverAvatarFree: {
      backgroundColor: t.colors.successBg,
      borderColor: t.colors.online
    },
    driverAvatarBusy: {
      backgroundColor: t.colors.warningBg,
      borderColor: t.colors.busy
    },
    driverAvatarText: {
      color: t.colors.text,
      fontSize: 22,
      fontWeight: "800" as const
    },
    driverMainInfo: {
      flex: 1,
      minWidth: 0
    },
    driverName: {
      color: t.colors.text,
      fontSize: 17,
      fontWeight: "800" as const,
      marginBottom: 8,
      ...rtlText
    },
    statusPill: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      alignSelf: "flex-start" as const,
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999
    },
    statusPillFree: {
      backgroundColor: t.colors.successBg
    },
    statusPillBusy: {
      backgroundColor: t.colors.warningBg
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4
    },
    statusDotFree: {
      backgroundColor: t.colors.online
    },
    statusDotBusy: {
      backgroundColor: t.colors.busy
    },
    statusPillText: {
      color: t.colors.textSecondary,
      fontSize: 12,
      fontWeight: "800" as const,
      ...rtlText
    },
    phoneRow: {
      ...rtlRow,
      gap: 8,
      flexWrap: "wrap" as const,
      justifyContent: "flex-start" as const
    },
    driverMetaLabel: {
      color: t.colors.textSubtle,
      fontSize: 12,
      fontWeight: "700" as const,
      ...rtlText
    },
    driverMetaValue: {
      color: t.colors.text,
      fontSize: 14,
      fontWeight: "600" as const,
      ...rtlText
    },
    whatsAppIconBtn: {
      padding: 4
    },
    driverActions: {
      flexDirection: "row-reverse" as const,
      flexWrap: "wrap" as const,
      gap: 8,
      justifyContent: "flex-start" as const
    },
    actionBtn: {
      flex: 1,
      minWidth: 92,
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 6,
      paddingVertical: 11,
      borderRadius: 12
    },
    mapBtn: {
      backgroundColor: t.colors.navigate
    },
    chatBtn: {
      backgroundColor: t.colors.infoBg,
      borderWidth: 1,
      borderColor: t.colors.info
    },
    chatBtnText: {
      color: t.colors.infoText,
      fontSize: 13,
      fontWeight: "800" as const,
      ...rtlText
    },
    assignBtn: {
      backgroundColor: t.colors.primary
    },
    actionBtnText: {
      color: t.colors.textInverse,
      fontSize: 13,
      fontWeight: "800" as const,
      ...rtlText
    },
    actionBtnDisabled: {
      opacity: 0.45
    }
  }));

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

      <View style={styles.phoneRow}>
        <Text style={styles.driverMetaLabel}>الهاتف</Text>
        <Text style={styles.driverMetaValue}>{driver.phone?.trim() || "لا يوجد رقم"}</Text>
        {hasPhone ? (
          <Pressable
            style={styles.whatsAppIconBtn}
            onPress={onWhatsApp}
            accessibilityRole="button"
            accessibilityLabel="فتح واتساب مع السائق"
            hitSlop={8}
          >
            <Ionicons name="logo-whatsapp" size={22} color={theme.colors.whatsapp} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.driverActions}>
        <Pressable
          style={[styles.actionBtn, styles.mapBtn, !hasLocation && styles.actionBtnDisabled]}
          disabled={!hasLocation}
          onPress={onOpenMaps}
        >
          <Ionicons name="navigate-outline" size={18} color={theme.colors.textInverse} />
          <Text style={styles.actionBtnText}>الموقع</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.chatBtn]} onPress={onChat}>
          <Ionicons name="chatbubble-outline" size={18} color={theme.colors.infoText} />
          <Text style={styles.chatBtnText}>محادثة</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.assignBtn, busy && styles.actionBtnDisabled]}
          disabled={busy}
          onPress={onAssign}
        >
          <Ionicons name="clipboard-outline" size={18} color={theme.colors.textInverse} />
          <Text style={styles.actionBtnText}>إسناد طلب</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DriversTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles((t) => ({
    root: {
      flex: 1,
      backgroundColor: t.colors.background,
      direction: "rtl" as const
    },
    socketBar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
      backgroundColor: t.colors.surfaceHeader,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border
    },
    socketDot: {
      width: 10,
      height: 10,
      borderRadius: 5
    },
    socketBarText: {
      color: t.colors.textSecondary,
      fontSize: 13,
      fontWeight: "700" as const,
      ...rtlText
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
      gap: 12
    },
    headerTopRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      justifyContent: "space-between" as const,
      gap: 12
    },
    headerText: {
      flex: 1
    },
    title: {
      color: t.colors.text,
      fontSize: 22,
      fontWeight: "800" as const,
      ...rtlText
    },
    headerHint: {
      marginTop: 4,
      color: t.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      ...rtlText
    },
    error: {
      marginTop: 8,
      color: t.colors.danger,
      fontSize: 12,
      ...rtlText
    },
    refreshBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: t.colors.buttonSecondaryBg
    },
    refreshBtnText: {
      color: t.colors.buttonSecondaryText,
      fontSize: 12,
      fontWeight: "800" as const,
      ...rtlText
    },
    searchWrap: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      backgroundColor: t.colors.surfaceInset,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 4
    },
    filterRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 8
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: t.colors.filterBg,
      borderWidth: 1,
      borderColor: t.colors.filterBorder
    },
    filterChipActive: {
      backgroundColor: t.colors.filterActiveBg,
      borderColor: t.colors.filterActiveBorder
    },
    filterChipText: {
      color: t.colors.filterText,
      fontSize: 12,
      fontWeight: "800" as const,
      ...rtlText
    },
    filterChipTextActive: {
      color: t.colors.filterActiveText
    },
    searchInput: {
      flex: 1,
      color: t.colors.text,
      fontSize: 15,
      minHeight: 42,
      ...rtlText
    },
    loadingState: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 12
    },
    loadingText: {
      color: t.colors.textSecondary,
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
      justifyContent: "center" as const
    },
    emptyState: {
      alignItems: "center" as const,
      gap: 10,
      paddingHorizontal: 24
    },
    emptyTitle: {
      color: t.colors.textSecondary,
      fontSize: 18,
      fontWeight: "800" as const,
      ...rtlText
    },
    emptyHint: {
      color: t.colors.textMuted,
      fontSize: 13,
      textAlign: "center" as const,
      lineHeight: 20,
      ...rtlText
    },
    footerWrap: {
      paddingTop: 12,
      paddingBottom: 8,
      alignItems: "center" as const
    },
    loadMoreBtn: {
      backgroundColor: t.colors.primaryDark,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12
    },
    loadMoreBtnText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 14,
      ...rtlText
    },
    footerHint: {
      color: t.colors.textSubtle,
      fontSize: 12,
      ...rtlText
    },
    quickModalRoot: {
      flex: 1,
      justifyContent: "flex-end" as const
    },
    quickBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.colors.overlay
    },
    quickSheet: {
      backgroundColor: t.colors.modalBg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 18,
      borderWidth: 1,
      borderColor: t.colors.modalBorder,
      maxHeight: "88%"
    },
    quickTitle: {
      fontSize: 20,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 6
    },
    quickSubtitle: {
      fontSize: 14,
      color: t.colors.textMuted,
      ...rtlText,
      marginBottom: 12
    },
    quickScroll: {
      paddingBottom: 12
    },
    quickLabel: {
      fontSize: 13,
      fontWeight: "700" as const,
      color: t.colors.textSecondary,
      ...rtlText,
      marginBottom: 6,
      marginTop: 10
    },
    quickInput: {
      backgroundColor: t.colors.inputBg,
      borderWidth: 1,
      borderColor: t.colors.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: t.colors.text,
      fontSize: 15,
      ...rtlText
    },
    quickHint: {
      marginTop: 12,
      fontSize: 12,
      color: t.colors.textSubtle,
      ...rtlText,
      lineHeight: 18
    },
    quickFooterBtns: {
      flexDirection: "row" as const,
      gap: 12,
      marginTop: 8
    },
    quickCancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: t.colors.buttonSecondaryBg,
      alignItems: "center" as const
    },
    quickCancelBtnText: {
      color: t.colors.buttonSecondaryText,
      fontWeight: "800" as const,
      fontSize: 15,
      ...rtlText
    },
    quickSaveBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: t.colors.primary,
      alignItems: "center" as const
    },
    quickSaveBtnText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 15,
      ...rtlText
    },
    actionBtnDisabled: {
      opacity: 0.45
    }
  }));
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

  const openDriverChat = async () => {
    try {
      const room = await getGlobalChatRoom();
      router.push(chatRoomHref(room) as `/chat/${string}`);
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر فتح المحادثة");
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
    socketStatus === "connected"
      ? theme.colors.online
      : socketStatus === "connecting"
        ? theme.colors.warning
        : theme.colors.offline;
  const socketLabel =
    socketStatus === "connected"
      ? "متصل — قائمة السائقين تتحدث تلقائيًا"
      : socketStatus === "connecting"
        ? "جاري الاتصال…"
        : "غير متصل";

  return (
    <View style={styles.root}>
      <View style={[styles.socketBar, { paddingTop: 8 }]}>
        <View style={[styles.socketDot, { backgroundColor: socketDotColor }]} />
        <Text style={styles.socketBarText}>{socketLabel}</Text>
      </View>

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>السائقون المتصلون</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
          <Pressable onPress={() => refreshList("refresh")} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={18} color={theme.colors.buttonSecondaryText} />
            <Text style={styles.refreshBtnText}>تحديث</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={theme.colors.textSubtle} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث عن سائق بالاسم أو الهاتف"
            placeholderTextColor={theme.colors.placeholder}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
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
          <ActivityIndicator size="large" color={theme.colors.accent} />
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
              onChat={() => void openDriverChat()}
              onWhatsApp={() => void openWhatsApp(item)}
              onOpenMaps={() => void openGoogleMaps(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={42} color={theme.colors.textSubtle} />
              <Text style={styles.emptyTitle}>{debouncedSearch ? "لا توجد نتائج" : "لا يوجد سائقون متصلون"}</Text>
              <Text style={styles.emptyHint}>
                {debouncedSearch ? "جرّب اسمًا مختلفًا أو امسح البحث." : "سيظهر هنا فقط السائقون المتصلون حاليًا."}
              </Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.footerWrap}>
              {loadingMore ? (
                <ActivityIndicator color={theme.colors.accent} />
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
        <KeyboardAvoidingView trustSystemResize behavior="padding" style={styles.quickModalRoot}>
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
                placeholderTextColor={theme.colors.placeholder}
                style={styles.quickInput}
                editable={!quickSubmitting}
              />
              <Text style={styles.quickLabel}>إلى (الوجهة)</Text>
              <TextInput
                value={quickTo}
                onChangeText={setQuickTo}
                placeholder="عنوان الوجهة"
                placeholderTextColor={theme.colors.placeholder}
                style={styles.quickInput}
                editable={!quickSubmitting}
              />
              <Text style={styles.quickLabel}>هاتف الزبون</Text>
              <TextInput
                value={quickPhone}
                onChangeText={setQuickPhone}
                placeholder="07xxxxxxxx"
                placeholderTextColor={theme.colors.placeholder}
                style={styles.quickInput}
                keyboardType="phone-pad"
                editable={!quickSubmitting}
              />
              <Text style={styles.quickLabel}>التكلفة</Text>
              <TextInput
                value={quickAmount}
                onChangeText={setQuickAmount}
                placeholder="مثال: 25"
                placeholderTextColor={theme.colors.placeholder}
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
                {quickSubmitting ? (
                  <ActivityIndicator color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.quickSaveBtnText}>إنشاء وإسناد</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

