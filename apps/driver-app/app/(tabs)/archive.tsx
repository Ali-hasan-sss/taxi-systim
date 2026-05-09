import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>جاري تحميل الأرشيف…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>الأرشيف</Text>
        <Text style={styles.subtitle}>
          مسندة إليك — 10 طلبات لكل تبويب؛ مرّر لأسفل لتحميل الدفعة التالية.
        </Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#2563eb" />}
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
              <ActivityIndicator color="#2563eb" />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc",
    direction: "rtl"
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8
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
    ...rtlText,
    width: "100%",
    textAlign: "center"
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    ...rtlText,
    marginBottom: 8
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    ...rtlText,
    lineHeight: 20,
    marginBottom: 10
  },
  tabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#cbd5e1"
  },
  tabActive: {
    backgroundColor: "#2563eb",
    borderColor: "#1d4ed8"
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    ...rtlText
  },
  tabLabelActive: {
    color: "#ffffff"
  },
  tabHint: {
    fontSize: 12,
    color: "#94a3b8",
    ...rtlText,
    marginBottom: 4
  },
  error: {
    color: "#dc2626",
    ...rtlText,
    marginTop: 8
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
  listEndHint: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 13,
    ...rtlText
  },
  empty: {
    color: "#64748b",
    ...rtlText,
    marginTop: 40,
    fontSize: 15,
    lineHeight: 24
  }
});
