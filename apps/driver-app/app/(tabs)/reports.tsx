import { useCallback, useEffect, useRef, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
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

function reportCommissionStatusColors(order: DriverOrderRow): { bg: string; fg: string } {
  return order.commission?.paymentStatus === "PAID"
    ? { bg: "#dcfce7", fg: "#166534" }
    : { bg: "#fee2e2", fg: "#991b1b" };
}

function authFailureMessage(msg: string): boolean {
  return /Unauthorized|غير مصرح|Forbidden|401|403|تجديد الجلسة|انتهت صلاحية الجلسة|Invalid refresh/i.test(msg);
}

export default function DriverReportsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <DriverScreenBackground>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#2563eb" />
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
            const commissionColors = reportCommissionStatusColors(item);
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#2563eb" />}
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
                    <Ionicons name="calendar-outline" size={18} color="#2563eb" />
                  </View>
                  <Text style={styles.datePickerValue}>{formatYmdLabel(draftFrom)}</Text>
                  <Text style={styles.datePickerHint}>{draftFrom}</Text>
                </Pressable>
                <Pressable style={styles.datePickerField} onPress={() => openPicker("to")}>
                  <View style={styles.datePickerTopRow}>
                    <Text style={styles.datePickerLabel}>إلى</Text>
                    <Ionicons name="calendar-outline" size={18} color="#2563eb" />
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
                <ActivityIndicator color="#2563eb" />
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "transparent",
    direction: "rtl"
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
    ...rtlText
  },
  header: {
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: "stretch",
    direction: "rtl"
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    ...rtlText,
    marginBottom: 14,
    textAlign: "right",
    alignSelf: "stretch"
  },
  filterCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 18,
    padding: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    alignSelf: "stretch"
  },
  filterHeader: {
    alignItems: "flex-end",
    marginBottom: 12
  },
  filterTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800",
    ...rtlText,
    textAlign: "right"
  },
  filterHint: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 12,
    lineHeight: 20,
    ...rtlText,
    textAlign: "right"
  },
  presetScrollView: {
    flexGrow: 0,
    marginBottom: 12
  },
  presetRow: {
    flexDirection: "row-reverse",
    gap: 8,
    alignItems: "center"
  },
  presetChip: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  presetChipActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb"
  },
  presetChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
    ...rtlText
  },
  presetChipTextActive: {
    color: "#ffffff"
  },
  dateRow: {
    flexDirection: "row-reverse",
    gap: 10
  },
  datePickerField: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "flex-end"
  },
  datePickerTopRow: {
    width: "100%",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  datePickerLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
    ...rtlText,
    textAlign: "right"
  },
  datePickerValue: {
    width: "100%",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
    ...rtlText,
    textAlign: "right"
  },
  datePickerHint: {
    width: "100%",
    marginTop: 4,
    color: "#64748b",
    fontSize: 11,
    ...rtlText,
    textAlign: "right"
  },
  applyBtn: {
    marginTop: 12,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  applyBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
    ...rtlText
  },
  error: {
    marginTop: 10,
    color: "#dc2626",
    ...rtlText,
    textAlign: "right"
  },
  statsStack: {
    marginTop: 14,
    alignSelf: "stretch"
  },
  statsRow: {
    flexDirection: "row-reverse",
    gap: 12,
    marginBottom: 12
  },
  statCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 4,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    alignItems: "flex-end"
  },
  statCardHalf: {
    flex: 1
  },
  statCardBlue: {
    borderColor: "#93c5fd"
  },
  statCardGreen: {
    borderColor: "#86efac"
  },
  statCardPurple: {
    borderColor: "#c4b5fd"
  },
  statValue: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
    ...rtlText,
    textAlign: "right"
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    ...rtlText,
    marginTop: 6,
    textAlign: "right"
  },
  statDetail: {
    fontSize: 11,
    color: "#64748b",
    ...rtlText,
    marginTop: 4,
    textAlign: "right"
  },
  summaryHint: {
    marginTop: 10,
    color: "#475569",
    fontSize: 12,
    ...rtlText,
    textAlign: "right",
    alignSelf: "flex-end",
    backgroundColor: "#eff6ff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  reportCommissionRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 2,
    flexWrap: "wrap"
  },
  reportCommissionAmount: {
    color: "#7c3aed",
    fontSize: 14,
    fontWeight: "800",
    marginTop: -2,
    marginBottom: 8,
    ...rtlText,
    textAlign: "right",
    alignSelf: "flex-end"
  },
  reportCommissionLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    ...rtlText,
    textAlign: "right"
  },
  reportCommissionBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  reportCommissionBadgeText: {
    fontSize: 12,
    fontWeight: "800",
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
    alignItems: "center"
  },
  empty: {
    color: "#64748b",
    ...rtlText,
    marginTop: 40,
    fontSize: 15,
    lineHeight: 24,
    textAlign: "right"
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "center",
    paddingHorizontal: 20
  },
  pickerSheet: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18
  },
  pickerTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800",
    ...rtlText,
    textAlign: "right",
    marginBottom: 8
  },
  pickerActions: {
    flexDirection: "row-reverse",
    gap: 10,
    marginTop: 12
  },
  pickerBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  pickerBtnGhost: {
    backgroundColor: "#e2e8f0"
  },
  pickerBtnPrimary: {
    backgroundColor: "#2563eb"
  },
  pickerBtnGhostText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
    ...rtlText
  },
  pickerBtnPrimaryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
    ...rtlText
  }
});
