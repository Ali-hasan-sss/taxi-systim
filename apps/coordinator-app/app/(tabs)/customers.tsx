import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type CustomerFilter,
  type CustomerRow,
  fetchCustomers,
  markCustomerContacted
} from "../../src/lib/api";
import { feedback } from "../../src/lib/feedback";
import { rtlText } from "../../src/lib/rtl-text";
import { clearSession, getSession } from "../../src/lib/session";
import { openSmsWithText } from "../../src/lib/sms";
import { coordinatorTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { openWhatsAppChat, WHATSAPP_OPEN_FAILED_MESSAGE } from "../../src/lib/whatsapp";
import { CoordinatorTabScreen } from "../../src/components/CoordinatorScreenBackground";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SY", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Damascus"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const FILTERS: { key: CustomerFilter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "most_orders", label: "الأكثر طلباً" },
  { key: "inactive", label: "المنقطعون" }
];

export default function CustomersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [inactiveCount, setInactiveCount] = useState(0);
  const [uncontactedInactiveCount, setUncontactedInactiveCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = useThemedStyles((t) => ({
    safe: { flex: 1, backgroundColor: "transparent" },
    header: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      gap: 10
    },
    titleRow: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const
    },
    title: {
      fontSize: 20,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: t.colors.surfaceMuted
    },
    hint: {
      fontSize: 12,
      color: t.colors.textMuted,
      ...rtlText,
      textAlign: "right" as const,
      lineHeight: 18
    },
    search: {
      backgroundColor: t.colors.inputBg,
      borderWidth: 1,
      borderColor: t.colors.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    filtersRow: {
      flexDirection: "row-reverse" as const,
      flexWrap: "wrap" as const,
      gap: 8
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceCard
    },
    filterChipActive: {
      borderColor: t.colors.primary,
      backgroundColor: t.colors.accentSoft
    },
    filterText: {
      fontSize: 13,
      fontWeight: "700" as const,
      color: t.colors.textSecondary,
      ...rtlText
    },
    filterTextActive: {
      color: t.colors.primary
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: coordinatorTabBarOuterHeight(insets.bottom) + 20,
      gap: 10
    },
    card: {
      backgroundColor: t.colors.surfaceCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: 14,
      gap: 8
    },
    nameRow: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      gap: 8
    },
    name: {
      flex: 1,
      fontSize: 16,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    contactDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: t.colors.danger,
      flexShrink: 0 as const
    },
    filterBadge: {
      marginStart: 6,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 9,
      backgroundColor: t.colors.danger,
      alignItems: "center" as const,
      justifyContent: "center" as const
    },
    filterBadgeText: {
      color: "#fff",
      fontSize: 10,
      fontWeight: "800" as const
    },
    filterChipInner: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const
    },
    meta: {
      fontSize: 13,
      color: t.colors.textMuted,
      ...rtlText,
      textAlign: "right" as const
    },
    phone: {
      fontSize: 14,
      fontWeight: "700" as const,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    actions: {
      flexDirection: "row-reverse" as const,
      gap: 10,
      marginTop: 4
    },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const
    },
    waBtn: { backgroundColor: "#25D366" },
    smsBtn: { backgroundColor: t.colors.info },
    error: {
      color: t.colors.danger,
      ...rtlText,
      textAlign: "right" as const,
      paddingHorizontal: 16,
      marginBottom: 8
    },
    empty: {
      textAlign: "center" as const,
      color: t.colors.textMuted,
      ...rtlText,
      marginTop: 40
    },
    footerLoader: { paddingVertical: 16 }
  }));

  const goLogin = useCallback(async () => {
    await clearSession();
    router.replace("/login");
  }, [router]);

  const loadPage = useCallback(
    async (pageToLoad: number, replace: boolean) => {
      const session = await getSession();
      if (!session?.accessToken) {
        await goLogin();
        return;
      }
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const res = await fetchCustomers(session.accessToken, {
          filter,
          q: appliedSearch || undefined,
          page: pageToLoad,
          limit: 30
        });
        setTotal(res.total);
        setInactiveCount(res.inactiveCount);
        setUncontactedInactiveCount(res.uncontactedInactiveCount ?? 0);
        setHasMore(res.hasMore);
        setPage(res.page);
        setRows((prev) => (replace ? res.customers : [...prev, ...res.customers]));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "تعذر تحميل الزبائن";
        setError(msg);
        if (/Unauthorized|غير مصرح|401|403|تجديد الجلسة|انتهت صلاحية/i.test(msg)) {
          await goLogin();
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [appliedSearch, filter, goLogin]
  );

  useFocusEffect(
    useCallback(() => {
      void loadPage(1, true);
    }, [loadPage])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadPage(1, true);
  };

  const applySearch = () => {
    setAppliedSearch(search.trim());
  };

  const markReached = async (customerId: string) => {
    let shouldPersist = false;
    setRows((prev) => {
      const current = prev.find((row) => row.id === customerId);
      if (!current?.needsContact) return prev;
      shouldPersist = true;
      return prev.map((row) =>
        row.id === customerId ? { ...row, needsContact: false, lastContactedAt: new Date().toISOString() } : row
      );
    });
    if (!shouldPersist) return;
    setUncontactedInactiveCount((n) => Math.max(0, n - 1));
    const session = await getSession();
    if (!session?.accessToken) return;
    try {
      await markCustomerContacted(session.accessToken, customerId);
    } catch {
      /* النقطة اختفت محليًا بعد فتح واتساب/الرسالة */
    }
  };

  const openWhatsApp = async (item: CustomerRow) => {
    const ok = await openWhatsAppChat(item.phone, { preferBusiness: true });
    if (!ok) {
      feedback.warning(WHATSAPP_OPEN_FAILED_MESSAGE);
      return;
    }
    if (item.needsContact) void markReached(item.id);
  };

  const openSms = async (item: CustomerRow) => {
    const ok = await openSmsWithText(item.phone, "");
    if (!ok) {
      feedback.warning("تعذر فتح تطبيق الرسائل.");
      return;
    }
    if (item.needsContact) void markReached(item.id);
  };

  return (
    <CoordinatorTabScreen>
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>الزبائن</Text>
            <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="رجوع">
              <Ionicons name="chevron-forward" size={22} color={theme.colors.text} />
            </Pressable>
          </View>
          <Text style={styles.hint}>
            المنقطع: لم يطلب منذ أسبوعين فأكثر ولديه أكثر من 10 طلبات. النقطة الحمراء تعني أنه لم يُتواصل معه بعد.
          </Text>
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="بحث بالاسم أو الرقم…"
            placeholderTextColor={theme.colors.placeholder}
            onSubmitEditing={applySearch}
            returnKeyType="search"
          />
          <Pressable onPress={applySearch} style={[styles.filterChip, styles.filterChipActive]}>
            <Text style={[styles.filterText, styles.filterTextActive]}>بحث</Text>
          </Pressable>
          <View style={styles.filtersRow}>
            {FILTERS.map((item) => {
              const active = filter === item.key;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(item.key)}
                >
                  <View style={styles.filterChipInner}>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {item.label}
                    {item.key === "inactive" ? ` (${inactiveCount})` : item.key === "all" ? ` (${total})` : ""}
                  </Text>
                  {item.key === "inactive" && uncontactedInactiveCount > 0 ? (
                    <View style={styles.filterBadge}>
                      <Text style={styles.filterBadgeText}>
                        {uncontactedInactiveCount > 99 ? "99+" : String(uncontactedInactiveCount)}
                      </Text>
                    </View>
                  ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && rows.length === 0 ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
            ListEmptyComponent={<Text style={styles.empty}>لا يوجد زبائن مطابقون.</Text>}
            onEndReached={() => {
              if (!hasMore || loadingMore || loading) return;
              void loadPage(page + 1, false);
            }}
            onEndReachedThreshold={0.35}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator color={theme.colors.primary} />
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.nameRow}>
                  {item.needsContact ? (
                    <View style={styles.contactDot} accessibilityLabel="لم يتم التواصل" />
                  ) : null}
                  <Text style={styles.name}>{item.name?.trim() || "بدون اسم"}</Text>
                </View>
                <Text style={styles.phone}>{item.phoneDisplay}</Text>
                <Text style={styles.meta}>الطلبات: {item.ordersCount}</Text>
                <Text style={styles.meta}>آخر طلب: {formatWhen(item.lastOrderAt)}</Text>
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.iconBtn, styles.waBtn]}
                    onPress={() => void openWhatsApp(item)}
                    accessibilityLabel="واتساب"
                  >
                    <Ionicons name="logo-whatsapp" size={22} color="#fff" />
                  </Pressable>
                  <Pressable
                    style={[styles.iconBtn, styles.smsBtn]}
                    onPress={() => void openSms(item)}
                    accessibilityLabel="رسالة SMS"
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}
    </SafeAreaView>
    </CoordinatorTabScreen>
  );
}
