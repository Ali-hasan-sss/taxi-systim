import { useTheme, useThemedStyles, type AppTheme } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverOrderCard } from "../../src/components/DriverOrderCard";
import { DriverScreenBackground } from "../../src/components/DriverScreenBackground";
import {
  type DriverOrderRow,
  type DriverOrdersReportSummary,
  driverOrdersReport
} from "../../src/lib/api";
import { clearDriverSession, getDriverSession } from "../../src/lib/session";
import { rtlText } from "../../src/lib/rtl-text";
import { driverTabBarOuterHeight } from "../../src/lib/tab-bar-inset";

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

function validateYmd(value: string): boolean {
  return YMD_RE.test(value.trim());
}

function ymdToLocalDate(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function localDateToYmd(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatYmdLabel(ymd: string): string {
  if (!validateYmd(ymd)) return ymd;
  return new Intl.DateTimeFormat("ar-SY", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(ymdToLocalDate(ymd));
}

function formatAmount(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return new Intl.NumberFormat("ar-SY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(n);
}

function reportCommissionStatusLabel(order: DriverOrderRow): "مدفوع" | "غير مدفوع" {
  return order.commission?.paymentStatus === "PAID" ? "مدفوع" : "غير مدفوع";
}

function reportCommissionStatusColors(order: DriverOrderRow, theme: AppTheme): { bg: string; fg: string } {
  return order.commission?.paymentStatus === "PAID"
    ? { bg: theme.colors.successBg, fg: theme.colors.successText }
    : { bg: theme.colors.dangerBg, fg: theme.colors.dangerText };
}

function authFailureMessage(msg: string): boolean {
  return /Unauthorized|غير مصرح|Forbidden|401|403|تجديد الجلسة|انتهت صلاحية الجلسة|Invalid refresh/i.test(msg);
}

export default function DriverReportsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const loadMoreLock = useRef(false);
  const filtersMountedRef = useRef(false);
  const today = useRef(syriaTodayYmd()).current;

  const [orders, setOrders] = useState<DriverOrderRow[]>([]);
  const [summary, setSummary] = useState<DriverOrdersReportSummary>({
    orderCount: 0,
    totalAmount: "0.00",
    totalCommission: "0.00",
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
  const [filters, setFilters] = useState({ from: today, to: today });
  const [pickerField, setPickerField] = useState<"from" | "to" | null>(null);
  const [pickerDate, setPickerDate] = useState(() => ymdToLocalDate(today));

  const goToLogin = useCallback(async () => {
    await clearDriverSession();
    router.replace("/login");
  }, [router]);

  const load = useCallback(
    async (isRefresh = false) => {
      const session = await getDriverSession();
      if (!session?.accessToken) {
        await goToLogin();
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await driverOrdersReport(session.accessToken, {
          from: filters.from,
          to: filters.to,
          limit: REPORTS_PAGE_SIZE
        });
        setOrders(page.orders);
        setSummary(page.summary);
        setNextCursor(page.nextCursor);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "حدث خطأ";
        setError(msg);
        if (authFailureMessage(msg)) {
          await goToLogin();
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters, goToLogin]
  );

  const loadMore = useCallback(async () => {
    if (nextCursor == null || loadMoreLock.current || loading || refreshing || loadingMore) {
      return;
    }
    const session = await getDriverSession();
    if (!session?.accessToken) {
      await goToLogin();
      return;
    }
    loadMoreLock.current = true;
    setLoadingMore(true);
    try {
      const page = await driverOrdersReport(session.accessToken, {
        from: filters.from,
        to: filters.to,
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
      setSummary(page.summary);
      setNextCursor(page.nextCursor);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "حدث خطأ";
      setError(msg);
      if (authFailureMessage(msg)) {
        await goToLogin();
      }
    } finally {
      loadMoreLock.current = false;
      setLoadingMore(false);
    }
  }, [filters, goToLogin, loading, loadingMore, nextCursor, refreshing]);

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

  const openPicker = (field: "from" | "to") => {
    const currentValue = field === "from" ? draftFrom : draftTo;
    setPickerDate(ymdToLocalDate(validateYmd(currentValue) ? currentValue : today));
    setPickerField(field);
  };

  const closePicker = () => {
    setPickerField(null);
  };

  const commitPickedDate = (field: "from" | "to", date: Date) => {
    const nextValue = localDateToYmd(date);
    if (field === "from") {
      setDraftFrom(nextValue);
    } else {
      setDraftTo(nextValue);
    }
    setError(null);
  };

  const handlePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!pickerField) return;
    if (Platform.OS === "android") {
      if (event.type === "dismissed" || !selectedDate) {
        closePicker();
        return;
      }
      commitPickedDate(pickerField, selectedDate);
      closePicker();
      return;
    }
    if (selectedDate) {
      setPickerDate(selectedDate);
    }
  };

  const confirmIosPicker = () => {
    if (!pickerField) return;
    commitPickedDate(pickerField, pickerDate);
    closePicker();
  };

  const applyDateFilters = () => {
    const from = draftFrom.trim() || today;
    const to = draftTo.trim() || from;
    if (!validateYmd(from) || !validateYmd(to)) {
      setError("صيغة التاريخ يجب أن تكون YYYY-MM-DD.");
      return;
    }
    if (from > to) {
      setError("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية.");
      return;
    }
    setError(null);
    setFilters({ from, to });
  };

  const setPresetRange = (days: 1 | 7 | 30) => {
    const to = today;
    const from = days === 1 ? to : shiftYmd(to, -(days - 1));
    setDraftFrom(from);
    setDraftTo(to);
    setError(null);
    setFilters({ from, to });
  };

  const isPresetActive = (days: 1 | 7 | 30) => {
    const to = today;
    const from = days === 1 ? to : shiftYmd(to, -(days - 1));
    return draftFrom === from && draftTo === to;
  };

  const listBottomPad = driverTabBarOuterHeight(insets.bottom) + 24;

  const styles = useThemedStyles((t) => ({
    safe: {
      flex: 1,
      backgroundColor: "transparent",
      direction: "rtl" as const
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
      ...rtlText
    },
    header: {
      paddingTop: 8,
      paddingBottom: 12,
      alignItems: "stretch" as const,
      direction: "rtl" as const
    },
    title: {
      fontSize: 22,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 14,
      textAlign: "right" as const,
      alignSelf: "stretch" as const
    },
    filterCard: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 18,
      padding: 16,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
      alignSelf: "stretch" as const
    },
    filterHeader: {
      alignItems: "flex-end" as const,
      marginBottom: 12
    },
    filterTitle: {
      color: t.colors.text,
      fontSize: 16,
      fontWeight: "800" as const,
      ...rtlText,
      textAlign: "right" as const
    },
    filterHint: {
      marginTop: 4,
      color: t.colors.textMuted,
      fontSize: 12,
      lineHeight: 20,
      ...rtlText,
      textAlign: "right" as const
    },
    presetScrollView: {
      flexGrow: 0,
      marginBottom: 12
    },
    presetRow: {
      flexDirection: "row-reverse" as const,
      gap: 8,
      alignItems: "center" as const
    },
    presetChip: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.filterBorder,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10
    },
    presetChipActive: {
      backgroundColor: t.colors.filterActiveBg,
      borderColor: t.colors.filterActiveBorder
    },
    presetChipText: {
      color: t.colors.textSecondary,
      fontSize: 12,
      fontWeight: "800" as const,
      ...rtlText
    },
    presetChipTextActive: {
      color: t.colors.filterActiveText
    },
    dateRow: {
      flexDirection: "row-reverse" as const,
      gap: 10
    },
    datePickerField: {
      flex: 1,
      backgroundColor: t.colors.inputBg,
      borderWidth: 1,
      borderColor: t.colors.inputBorder,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      alignItems: "flex-end" as const
    },
    datePickerTopRow: {
      width: "100%",
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      marginBottom: 8
    },
    datePickerLabel: {
      color: t.colors.textSubtle,
      fontSize: 13,
      fontWeight: "800" as const,
      ...rtlText,
      textAlign: "right" as const
    },
    datePickerValue: {
      width: "100%",
      color: t.colors.text,
      fontSize: 15,
      fontWeight: "700" as const,
      ...rtlText,
      textAlign: "right" as const
    },
    datePickerHint: {
      width: "100%",
      marginTop: 4,
      color: t.colors.textMuted,
      fontSize: 11,
      ...rtlText,
      textAlign: "right" as const
    },
    applyBtn: {
      marginTop: 12,
      backgroundColor: t.colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center" as const
    },
    applyBtnText: {
      color: t.colors.textInverse,
      fontSize: 14,
      fontWeight: "800" as const,
      ...rtlText
    },
    error: {
      marginTop: 10,
      color: t.colors.danger,
      ...rtlText,
      textAlign: "right" as const
    },
    statsStack: {
      marginTop: 14,
      alignSelf: "stretch" as const
    },
    statsRow: {
      flexDirection: "row-reverse" as const,
      gap: 12,
      marginBottom: 12
    },
    statCard: {
      backgroundColor: t.colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      marginBottom: 4,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
      alignItems: "flex-end" as const
    },
    statCardHalf: {
      flex: 1
    },
    statCardBlue: {
      borderColor: t.colors.info
    },
    statCardGreen: {
      borderColor: t.colors.success
    },
    statCardPurple: {
      borderColor: t.colors.accent
    },
    statValue: {
      fontSize: 26,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    statLabel: {
      fontSize: 13,
      fontWeight: "700" as const,
      color: t.colors.textSecondary,
      ...rtlText,
      marginTop: 6,
      textAlign: "right" as const
    },
    statDetail: {
      fontSize: 11,
      color: t.colors.textMuted,
      ...rtlText,
      marginTop: 4,
      textAlign: "right" as const
    },
    summaryHint: {
      marginTop: 10,
      color: t.colors.infoText,
      fontSize: 12,
      ...rtlText,
      textAlign: "right" as const,
      alignSelf: "flex-end" as const,
      backgroundColor: t.colors.infoBg,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    reportCommissionRow: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      justifyContent: "flex-end" as const,
      gap: 8,
      marginTop: 2,
      flexWrap: "wrap" as const
    },
    reportCommissionAmount: {
      color: t.colors.accent,
      fontSize: 14,
      fontWeight: "800" as const,
      marginTop: -2,
      marginBottom: 8,
      ...rtlText,
      textAlign: "right" as const,
      alignSelf: "flex-end" as const
    },
    reportCommissionLabel: {
      color: t.colors.textSubtle,
      fontSize: 13,
      fontWeight: "700" as const,
      ...rtlText,
      textAlign: "right" as const
    },
    reportCommissionBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
    reportCommissionBadgeText: {
      fontSize: 12,
      fontWeight: "800" as const,
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
      color: t.colors.textMuted,
      ...rtlText,
      marginTop: 40,
      fontSize: 15,
      lineHeight: 24,
      textAlign: "right" as const
    },
    pickerBackdrop: {
      flex: 1,
      backgroundColor: t.colors.overlay,
      justifyContent: "center" as const,
      paddingHorizontal: 20
    },
    pickerSheet: {
      backgroundColor: t.colors.modalBg,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: t.colors.modalBorder
    },
    pickerTitle: {
      color: t.colors.text,
      fontSize: 16,
      fontWeight: "800" as const,
      ...rtlText,
      textAlign: "right" as const,
      marginBottom: 8
    },
    pickerActions: {
      flexDirection: "row-reverse" as const,
      gap: 10,
      marginTop: 12
    },
    pickerBtn: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center" as const
    },
    pickerBtnGhost: {
      backgroundColor: t.colors.buttonSecondaryBg
    },
    pickerBtnPrimary: {
      backgroundColor: t.colors.primary
    },
    pickerBtnGhostText: {
      color: t.colors.buttonSecondaryText,
      fontSize: 14,
      fontWeight: "800" as const,
      ...rtlText
    },
    pickerBtnPrimaryText: {
      color: t.colors.textInverse,
      fontSize: 14,
      fontWeight: "800" as const,
      ...rtlText
    }
  }));

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <DriverScreenBackground>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>جاري تحميل التقرير…</Text>
          </View>
        </DriverScreenBackground>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <DriverScreenBackground>
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const commissionColors = reportCommissionStatusColors(item, theme);
            return (
              <DriverOrderCard
                item={item}
                variant="archive"
                afterAmountRow={
                  <Text style={styles.reportCommissionAmount}>
                    العمولة: {formatAmount(item.commission?.calculatedCommission ?? "0")}
                  </Text>
                }
                footer={
                  <View style={styles.reportCommissionRow}>
                    <Text style={styles.reportCommissionLabel}>حالة العمولة:</Text>
                    <View style={[styles.reportCommissionBadge, { backgroundColor: commissionColors.bg }]}>
                      <Text style={[styles.reportCommissionBadgeText, { color: commissionColors.fg }]}>
                        {reportCommissionStatusLabel(item)}
                      </Text>
                    </View>
                  </View>
                }
              />
            );
          }}
          contentContainerStyle={
            orders.length === 0
              ? [styles.emptyList, { paddingBottom: listBottomPad }]
              : [styles.list, { paddingBottom: listBottomPad }]
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.primary} />}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.35}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>التقارير</Text>
              <View style={styles.filterCard}>
              <View style={styles.filterHeader}>
                <Text style={styles.filterTitle}>فترة التقرير</Text>
                <Text style={styles.filterHint}>اختر فترة سريعة أو حدّد تاريخ البداية والنهاية من التقويم.</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.presetScrollView}
                contentContainerStyle={styles.presetRow}
              >
                <Pressable
                  onPress={() => setPresetRange(1)}
                  style={[styles.presetChip, isPresetActive(1) && styles.presetChipActive]}
                >
                  <Text style={[styles.presetChipText, isPresetActive(1) && styles.presetChipTextActive]}>
                    اليوم
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPresetRange(7)}
                  style={[styles.presetChip, isPresetActive(7) && styles.presetChipActive]}
                >
                  <Text style={[styles.presetChipText, isPresetActive(7) && styles.presetChipTextActive]}>
                    آخر 7 أيام
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPresetRange(30)}
                  style={[styles.presetChip, isPresetActive(30) && styles.presetChipActive]}
                >
                  <Text style={[styles.presetChipText, isPresetActive(30) && styles.presetChipTextActive]}>
                    آخر 30 يومًا
                  </Text>
                </Pressable>
              </ScrollView>

              <View style={styles.dateRow}>
                <Pressable style={styles.datePickerField} onPress={() => openPicker("from")}>
                  <View style={styles.datePickerTopRow}>
                    <Text style={styles.datePickerLabel}>من</Text>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.datePickerValue}>{formatYmdLabel(draftFrom)}</Text>
                  <Text style={styles.datePickerHint}>{draftFrom}</Text>
                </Pressable>
                <Pressable style={styles.datePickerField} onPress={() => openPicker("to")}>
                  <View style={styles.datePickerTopRow}>
                    <Text style={styles.datePickerLabel}>إلى</Text>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.datePickerValue}>{formatYmdLabel(draftTo)}</Text>
                  <Text style={styles.datePickerHint}>{draftTo}</Text>
                </Pressable>
              </View>

              <Pressable onPress={applyDateFilters} style={styles.applyBtn}>
                <Text style={styles.applyBtnText}>تحديث التقرير</Text>
              </Pressable>

              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>

            <View style={styles.statsStack}>
              <View style={styles.statsRow}>
                <View style={[styles.statCard, styles.statCardHalf, styles.statCardBlue]}>
                  <Text style={styles.statValue}>{summary.orderCount}</Text>
                  <Text style={styles.statLabel}>عدد الطلبات</Text>
                </View>
                <View style={[styles.statCard, styles.statCardHalf, styles.statCardGreen]}>
                  <Text style={styles.statValue}>{formatAmount(summary.totalAmount)}</Text>
                  <Text style={styles.statLabel}>مجموع مبالغ الطلبات المكتملة</Text>
                </View>
              </View>
              <View style={[styles.statCard, styles.statCardPurple]}>
                <Text style={styles.statValue}>{formatAmount(summary.totalCommission)}</Text>
                <Text style={styles.statLabel}>العمولة المستحقة</Text>
                <Text style={styles.statDetail}>غير المسددة ضمن الفترة المحددة.</Text>
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
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>لا توجد طلبات ضمن هذه الفترة.</Text>}
        />
      </DriverScreenBackground>
      {Platform.OS === "android" && pickerField ? (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          maximumDate={ymdToLocalDate(today)}
          onChange={handlePickerChange}
        />
      ) : null}
      {Platform.OS === "ios" ? (
        <Modal visible={pickerField != null} transparent animationType="fade" onRequestClose={closePicker}>
          <View style={styles.pickerBackdrop}>
            <View style={styles.pickerSheet}>
              <Text style={styles.pickerTitle}>{pickerField === "from" ? "اختر تاريخ البداية" : "اختر تاريخ النهاية"}</Text>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="spinner"
                maximumDate={ymdToLocalDate(today)}
                onChange={handlePickerChange}
              />
              <View style={styles.pickerActions}>
                <Pressable style={[styles.pickerBtn, styles.pickerBtnGhost]} onPress={closePicker}>
                  <Text style={styles.pickerBtnGhostText}>إلغاء</Text>
                </Pressable>
                <Pressable style={[styles.pickerBtn, styles.pickerBtnPrimary]} onPress={confirmIosPicker}>
                  <Text style={styles.pickerBtnPrimaryText}>اعتماد</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

