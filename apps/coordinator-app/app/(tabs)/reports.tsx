import { useTheme, useThemedStyles, KeyboardAvoidingView } from "@taxi/expo-theme";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { CoordinatorOrderCard } from "../../src/components/CoordinatorOrderCard";
import {
  type CoordinatorOrderRow,
  type CoordinatorOrdersReportSummary,
  type DriverForAssignment,
  coordinatorOrdersReport,
  coordinatorSearchDriversForAssignment
} from "../../src/lib/api";
import { coordinatorTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { feedback } from "../../src/lib/feedback";
import { clearSession, getSession } from "../../src/lib/session";
import { rtlText } from "../../src/lib/rtl-text";

const REPORTS_PAGE_SIZE = 20;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function syriaTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Damascus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + deltaDays, 12, 0, 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(dt);
}

function formatAmount(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return new Intl.NumberFormat("ar-SY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(n);
}

function validateYmd(value: string): boolean {
  return YMD_RE.test(value.trim());
}

export default function ReportsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles((t) => ({
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
      ...rtlText
    },
    headerBlock: {
      paddingHorizontal: 20,
      paddingBottom: 12
    },
    title: {
      fontSize: 22,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 8
    },
    subtitle: {
      fontSize: 13,
      color: t.colors.textMuted,
      ...rtlText,
      lineHeight: 20,
      marginBottom: 12
    },
    presetScrollView: {
      flexGrow: 0,
      marginBottom: 12
    },
    presetRow: {
      flexDirection: "row" as const,
      gap: 8,
      alignItems: "center" as const
    },
    presetChip: {
      backgroundColor: t.colors.filterBg,
      borderWidth: 1,
      borderColor: t.colors.filterBorder,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10
    },
    presetChipText: {
      color: t.colors.chipText,
      fontSize: 12,
      fontWeight: "800" as const,
      ...rtlText
    },
    dateRow: {
      flexDirection: "row" as const,
      gap: 10
    },
    dateField: {
      flex: 1
    },
    label: {
      color: t.colors.textMuted,
      fontSize: 13,
      fontWeight: "700" as const,
      marginBottom: 6,
      ...rtlText
    },
    input: {
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
    filterActionsRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 8,
      marginTop: 12
    },
    applyBtn: {
      backgroundColor: t.colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12
    },
    applyBtnText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 13,
      ...rtlText
    },
    secondaryBtn: {
      backgroundColor: t.colors.buttonSecondaryBg,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12
    },
    secondaryBtnText: {
      color: t.colors.buttonSecondaryText,
      fontWeight: "800" as const,
      fontSize: 13,
      ...rtlText
    },
    clearBtn: {
      backgroundColor: t.colors.dangerBg,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12
    },
    clearBtnText: {
      color: t.colors.dangerText,
      fontWeight: "800" as const,
      fontSize: 13,
      ...rtlText
    },
    selectedDriverText: {
      marginTop: 10,
      color: t.colors.textSecondary,
      fontSize: 13,
      ...rtlText
    },
    error: {
      color: t.colors.danger,
      marginTop: 8,
      ...rtlText
    },
    statsGrid: {
      flexDirection: "row" as const,
      gap: 12,
      marginTop: 14
    },
    statTile: {
      flex: 1,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1
    },
    statTilePrimary: {
      backgroundColor: t.colors.surface,
      borderColor: t.colors.primary
    },
    statTileSecondary: {
      backgroundColor: t.colors.surface,
      borderColor: t.colors.success
    },
    tileValue: {
      color: t.colors.text,
      fontSize: 24,
      fontWeight: "800" as const,
      ...rtlText
    },
    tileLabel: {
      marginTop: 6,
      color: t.colors.textMuted,
      fontSize: 12,
      fontWeight: "700" as const,
      ...rtlText
    },
    summaryHint: {
      marginTop: 10,
      color: t.colors.textSubtle,
      fontSize: 12,
      ...rtlText
    },
    list: {
      paddingHorizontal: 20
    },
    emptyList: {
      flexGrow: 1,
      paddingHorizontal: 20
    },
    listFooterLoader: {
      paddingVertical: 20,
      alignItems: "center" as const
    },
    empty: {
      color: t.colors.textSubtle,
      marginTop: 40,
      fontSize: 15,
      lineHeight: 24,
      ...rtlText
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
      marginBottom: 6,
      ...rtlText
    },
    modalHint: {
      fontSize: 12,
      color: t.colors.textMuted,
      marginBottom: 12,
      ...rtlText
    },
    modalLoading: {
      marginVertical: 32,
      minHeight: 120
    },
    driverList: {
      flexGrow: 0,
      maxHeight: 380,
      marginTop: 12
    },
    driverRow: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: t.colors.surfaceInset,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: t.colors.border
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
      marginTop: 4,
      ...rtlText
    },
    noDrivers: {
      color: t.colors.textSubtle,
      paddingVertical: 16,
      ...rtlText
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
  const loadMoreLock = useRef(false);
  const filtersMountedRef = useRef(false);
  const today = useRef(syriaTodayYmd()).current;

  const [orders, setOrders] = useState<CoordinatorOrderRow[]>([]);
  const [summary, setSummary] = useState<CoordinatorOrdersReportSummary>({
    orderCount: 0,
    totalAmount: "0.00",
    from: today,
    to: today
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftFrom, setDraftFrom] = useState(today);
  const [draftTo, setDraftTo] = useState(today);
  const [filters, setFilters] = useState<{
    from: string;
    to: string;
    driverId: string | null;
    driverName: string | null;
  }>({
    from: today,
    to: today,
    driverId: null,
    driverName: null
  });

  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [driverQuery, setDriverQuery] = useState("");
  const [driverResults, setDriverResults] = useState<DriverForAssignment[]>([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const driverSearchAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      const session = await getSession();
      if (!session?.accessToken) {
        router.replace("/login");
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const page = await coordinatorOrdersReport(session.accessToken, {
          from: filters.from,
          to: filters.to,
          driverId: filters.driverId,
          limit: REPORTS_PAGE_SIZE
        });
        setOrders(page.orders);
        setSummary(page.summary);
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
    },
    [filters, router]
  );

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
    try {
      const page = await coordinatorOrdersReport(session.accessToken, {
        from: filters.from,
        to: filters.to,
        driverId: filters.driverId,
        cursor: nextCursor,
        limit: REPORTS_PAGE_SIZE
      });
      setOrders((prev) => {
        const seen = new Set(prev.map((o) => o.id));
        const out = [...prev];
        for (const order of page.orders) {
          if (!seen.has(order.id)) {
            seen.add(order.id);
            out.push(order);
          }
        }
        return out;
      });
      setNextCursor(page.nextCursor);
      setSummary(page.summary);
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
  }, [filters, loading, nextCursor, refreshing, router]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  useEffect(() => {
    if (!filtersMountedRef.current) {
      filtersMountedRef.current = true;
      return;
    }
    void load(false);
  }, [filters, load]);

  useEffect(() => {
    if (!driverModalOpen) {
      driverSearchAbortRef.current?.abort();
      driverSearchAbortRef.current = null;
      setDriverQuery("");
      setDriverResults([]);
      setDriverLoading(false);
      return;
    }

    const trimmed = driverQuery.trim();
    if (trimmed.length < 2) {
      driverSearchAbortRef.current?.abort();
      driverSearchAbortRef.current = null;
      setDriverResults([]);
      setDriverLoading(false);
      return;
    }

    setDriverLoading(true);
    const handle = setTimeout(() => {
      driverSearchAbortRef.current?.abort();
      const ac = new AbortController();
      driverSearchAbortRef.current = ac;

      void (async () => {
        try {
          const session = await getSession();
          if (!session?.accessToken) {
            if (!ac.signal.aborted) {
              setDriverModalOpen(false);
              router.replace("/login");
            }
            return;
          }
          const list = await coordinatorSearchDriversForAssignment(session.accessToken, trimmed, ac.signal);
          if (!ac.signal.aborted) {
            setDriverResults(Array.isArray(list) ? list : []);
          }
        } catch (e) {
          if (!ac.signal.aborted) {
            feedback.error(e instanceof Error ? e.message : "تعذر تحميل السائقين.");
          }
        } finally {
          if (!ac.signal.aborted) {
            setDriverLoading(false);
          }
        }
      })();
    }, 350);

    return () => {
      clearTimeout(handle);
      driverSearchAbortRef.current?.abort();
    };
  }, [driverModalOpen, driverQuery, router]);

  const applyDateFilters = () => {
    const from = draftFrom.trim() || today;
    const to = draftTo.trim() || from;
    if (!validateYmd(from) || !validateYmd(to)) {
      feedback.warning("صيغة التاريخ يجب أن تكون YYYY-MM-DD.");
      return;
    }
    if (from > to) {
      feedback.warning("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية.");
      return;
    }
    setFilters((prev) => ({ ...prev, from, to }));
  };

  const setPresetRange = (days: 1 | 7 | 30) => {
    const to = today;
    const from = days === 1 ? to : shiftYmd(to, -(days - 1));
    setDraftFrom(from);
    setDraftTo(to);
    setFilters((prev) => ({ ...prev, from, to }));
  };

  const selectDriver = (driver: DriverForAssignment) => {
    setDriverModalOpen(false);
    setFilters((prev) => ({ ...prev, driverId: driver.id, driverName: driver.fullName || "سائق" }));
  };

  const clearDriverFilter = () => {
    setFilters((prev) => ({ ...prev, driverId: null, driverName: null }));
  };

  const listBottomPad = coordinatorTabBarOuterHeight(insets.bottom) + 24;

  if (loading && orders.length === 0) {
    return (
      <View style={[styles.centered, { paddingTop: 12 }]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>جاري تحميل التقرير…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: 8 }]}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CoordinatorOrderCard item={item} />}
        contentContainerStyle={
          orders.length === 0
            ? [styles.emptyList, { paddingBottom: listBottomPad }]
            : [styles.list, { paddingBottom: listBottomPad }]
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.accent} />}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={styles.title}>تقارير العمل</Text>
            <Text style={styles.subtitle}>اطلع على طلباتك اليومية أو خلال فترة محددة، مع فلتر اختياري حسب السائق.</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.presetScrollView}
              contentContainerStyle={styles.presetRow}
            >
              <Pressable onPress={() => setPresetRange(1)} style={styles.presetChip}>
                <Text style={styles.presetChipText}>اليوم</Text>
              </Pressable>
              <Pressable onPress={() => setPresetRange(7)} style={styles.presetChip}>
                <Text style={styles.presetChipText}>آخر 7 أيام</Text>
              </Pressable>
              <Pressable onPress={() => setPresetRange(30)} style={styles.presetChip}>
                <Text style={styles.presetChipText}>آخر 30 يومًا</Text>
              </Pressable>
            </ScrollView>

            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Text style={styles.label}>من</Text>
                <TextInput
                  value={draftFrom}
                  onChangeText={setDraftFrom}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.colors.placeholder}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.dateField}>
                <Text style={styles.label}>إلى</Text>
                <TextInput
                  value={draftTo}
                  onChangeText={setDraftTo}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.colors.placeholder}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.filterActionsRow}>
              <Pressable onPress={applyDateFilters} style={styles.applyBtn}>
                <Text style={styles.applyBtnText}>تطبيق الفترة</Text>
              </Pressable>
              <Pressable onPress={() => setDriverModalOpen(true)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>{filters.driverName ? "تغيير السائق" : "اختيار سائق"}</Text>
              </Pressable>
              {filters.driverId ? (
                <Pressable onPress={clearDriverFilter} style={styles.clearBtn}>
                  <Text style={styles.clearBtnText}>مسح السائق</Text>
                </Pressable>
              ) : null}
            </View>

            {filters.driverName ? <Text style={styles.selectedDriverText}>السائق المحدد: {filters.driverName}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.statsGrid}>
              <View style={[styles.statTile, styles.statTilePrimary]}>
                <Text style={styles.tileValue}>{summary.orderCount}</Text>
                <Text style={styles.tileLabel}>عدد الطلبات</Text>
              </View>
              <View style={[styles.statTile, styles.statTileSecondary]}>
                <Text style={styles.tileValue}>{formatAmount(summary.totalAmount)}</Text>
                <Text style={styles.tileLabel}>مجموع مبالغ الطلبات المكتملة</Text>
              </View>
            </View>

            <Text style={styles.summaryHint}>
              الفترة: {summary.from || filters.from} إلى {summary.to || filters.to}
            </Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.listFooterLoader}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.empty}>لا توجد طلبات ضمن هذه الفترة أو الفلاتر الحالية.</Text>}
      />

      <Modal visible={driverModalOpen} animationType="slide" transparent onRequestClose={() => setDriverModalOpen(false)}>
        <KeyboardAvoidingView inModal behavior="padding" keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0} style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setDriverModalOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <Text style={styles.modalTitle}>اختر سائقًا للتقرير</Text>
            <Text style={styles.modalHint}>ابدأ بالكتابة (حرفان على الأقل) للبحث بالاسم أو الهاتف.</Text>
            <TextInput
              value={driverQuery}
              onChangeText={setDriverQuery}
              placeholder="اسم السائق أو الهاتف…"
              placeholderTextColor={theme.colors.placeholder}
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />

            {driverLoading ? (
              <ActivityIndicator style={styles.modalLoading} color={theme.colors.accent} />
            ) : (
              <FlatList
                data={driverResults}
                keyExtractor={(item) => item.id}
                style={styles.driverList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable style={styles.driverRow} onPress={() => selectDriver(item)}>
                    <Text style={styles.driverName}>{item.fullName || "سائق"}</Text>
                    <Text style={styles.driverMeta}>{item.phone ?? "—"}</Text>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <Text style={styles.noDrivers}>
                    {driverQuery.trim().length < 2 ? "اكتب حرفين على الأقل للبحث عن سائق." : "لا يوجد سائق يطابق البحث."}
                  </Text>
                }
              />
            )}

            <Pressable style={styles.modalClose} onPress={() => setDriverModalOpen(false)}>
              <Text style={styles.modalCloseText}>إغلاق</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

