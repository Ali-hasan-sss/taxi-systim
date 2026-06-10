import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverScreenBackground } from "../../src/components/DriverScreenBackground";
import { DriverOrderCard } from "../../src/components/DriverOrderCard";
import {
  type DriverArchiveSegment,
  type DriverOrderRow,
  driverListOrders
} from "../../src/lib/api";
import { clearDriverSession, getDriverSession } from "../../src/lib/session";
import { rtlText } from "../../src/lib/rtl-text";
import { driverTabBarOuterHeight } from "../../src/lib/tab-bar-inset";

const ARCHIVE_PAGE_SIZE = 10;

const ARCHIVE_TABS: { key: DriverArchiveSegment; label: string; hint: string }[] = [
  { key: "completed", label: "مكتملة", hint: "طلبات أُنهيت بنجاح." },
  { key: "cancelled", label: "ملغاة", hint: "طلبات أُلغيت." },
  { key: "stuck", label: "متعثرة", hint: "لم يُعثر على الزبون." }
];

export default function DriverArchiveTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [segment, setSegment] = useState<DriverArchiveSegment>("completed");
  const [orders, setOrders] = useState<DriverOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreLock = useRef(false);
  /** لـ onEndReached: لا نحمّل الصفحة التالية إلا بعد أن يمرّر المستخدم (تفادي طلبات عند أول رسم). */
  const userHasScrolledRef = useRef(false);
  const listViewportHRef = useRef(0);
  const listContentHRef = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    const session = await getDriverSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const page = await driverListOrders(session.accessToken, "archive", {
        limit: ARCHIVE_PAGE_SIZE,
        archiveSegment: segment
      });
      setOrders(page.orders);
      setNextCursor(page.nextCursor);
      userHasScrolledRef.current = false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "حدث خطأ";
      setError(msg);
      if (msg.includes("Unauthorized") || msg.includes("غير مصرح")) {
        await clearDriverSession();
        router.replace("/login");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router, segment]);

  const loadMore = useCallback(async (opts?: { bypassScrollGuard?: boolean }) => {
    if (nextCursor == null || loadMoreLock.current || loading || refreshing || loadingMore) {
      return;
    }
    if (!opts?.bypassScrollGuard && !userHasScrolledRef.current) {
      return;
    }
    const session = await getDriverSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }
    loadMoreLock.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await driverListOrders(session.accessToken, "archive", {
        cursor: nextCursor,
        limit: ARCHIVE_PAGE_SIZE,
        archiveSegment: segment
      });
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
        await clearDriverSession();
        router.replace("/login");
      }
    } finally {
      loadMoreLock.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor, loading, refreshing, loadingMore, router, segment]);

  /** إن كانت الدفعة الأولى (10) لا تملأ الشاشة، نجلب 10 أخرى تلقائياً حتى تصبح القائمة قابلة للتمرير أو ينتهي الأرشيف. */
  const tryLoadMoreIfListDoesNotFillScreen = useCallback(() => {
    const vh = listViewportHRef.current;
    const ch = listContentHRef.current;
    if (vh < 80 || ch < 1) return;
    if (ch > vh + 24) return;
    void loadMore({ bypassScrollGuard: true });
  }, [loadMore]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const onSelectSegment = (s: DriverArchiveSegment) => {
    if (s === segment) return;
    setOrders([]);
    setNextCursor(null);
    userHasScrolledRef.current = false;
    setSegment(s);
  };

  const tabHint = ARCHIVE_TABS.find((t) => t.key === segment)?.hint ?? "";
  const listBottomPad = driverTabBarOuterHeight(insets.bottom) + 24;

  const styles = useThemedStyles((t) => ({
    safe: {
      flex: 1,
      backgroundColor: "transparent",
      direction: "rtl" as const
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 8,
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
      ...rtlText,
      width: "100%",
      textAlign: "center" as const
    },
    title: {
      fontSize: 22,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 8,
      textAlign: "right" as const
    },
    subtitle: {
      fontSize: 13,
      color: t.colors.textMuted,
      ...rtlText,
      lineHeight: 20,
      marginBottom: 10,
      textAlign: "right" as const
    },
    tabsRow: {
      flexDirection: "row-reverse" as const,
      flexWrap: "wrap" as const,
      gap: 8,
      marginBottom: 8
    },
    tab: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: t.colors.filterBg,
      borderWidth: 1,
      borderColor: t.colors.filterBorder
    },
    tabActive: {
      backgroundColor: t.colors.filterActiveBg,
      borderColor: t.colors.filterActiveBorder
    },
    tabLabel: {
      fontSize: 14,
      fontWeight: "700" as const,
      color: t.colors.filterText,
      ...rtlText,
      textAlign: "right" as const
    },
    tabLabelActive: {
      color: t.colors.filterActiveText
    },
    tabHint: {
      fontSize: 12,
      color: t.colors.textMuted,
      ...rtlText,
      marginBottom: 4,
      textAlign: "right" as const
    },
    error: {
      color: t.colors.danger,
      ...rtlText,
      marginTop: 8,
      textAlign: "right" as const
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
    listEndHint: {
      paddingVertical: 16,
      paddingHorizontal: 8,
      textAlign: "center" as const,
      color: t.colors.textMuted,
      fontSize: 13,
      ...rtlText
    },
    empty: {
      color: t.colors.textMuted,
      ...rtlText,
      marginTop: 40,
      fontSize: 15,
      lineHeight: 24,
      textAlign: "right" as const
    }
  }));

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <DriverScreenBackground>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>جاري تحميل الأرشيف…</Text>
          </View>
        </DriverScreenBackground>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <DriverScreenBackground>
        <View style={styles.header}>
          <Text style={styles.title}>الأرشيف</Text>
        
          <View style={styles.tabsRow}>
            {ARCHIVE_TABS.map((t) => {
              const active = t.key === segment;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => onSelectSegment(t.key)}
                  style={[styles.tab, active && styles.tabActive]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {tabHint ? <Text style={styles.tabHint}>{tabHint}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <FlatList
          key={segment}
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DriverOrderCard item={item} variant="archive" />}
          onLayout={(e) => {
            listViewportHRef.current = e.nativeEvent.layout.height;
            tryLoadMoreIfListDoesNotFillScreen();
          }}
          onContentSizeChange={(_w, h) => {
            listContentHRef.current = h;
            tryLoadMoreIfListDoesNotFillScreen();
          }}
          contentContainerStyle={
            orders.length === 0
              ? [styles.emptyList, { paddingBottom: listBottomPad }]
              : [styles.list, { paddingBottom: listBottomPad }]
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.primary} />}
          onScrollBeginDrag={() => {
            userHasScrolledRef.current = true;
          }}
          onScroll={(e) => {
            if (e.nativeEvent.contentOffset.y > 4) userHasScrolledRef.current = true;
          }}
          scrollEventThrottle={100}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.15}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.listFooterLoader}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : nextCursor == null && orders.length > 0 ? (
              <Text style={styles.listEndHint}>انتهى الأرشيف — لا طلبات أخرى</Text>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {segment === "completed"
                ? "لا توجد طلبات مكتملة بعد."
                : segment === "cancelled"
                  ? "لا توجد طلبات ملغاة بعد."
                  : "لا توجد طلبات متعثرة بعد."}
            </Text>
          }
        />
      </DriverScreenBackground>
    </SafeAreaView>
  );
}

