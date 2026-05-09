import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coordinatorTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { CoordinatorOrderCard } from "../../src/components/CoordinatorOrderCard";
import {
  type CoordinatorArchiveOrdersSegment,
  type CoordinatorOrderRow,
  coordinatorListOrders,
  coordinatorMe
} from "../../src/lib/api";
import { clearSession, getSession } from "../../src/lib/session";
import { rtlText } from "../../src/lib/rtl-text";

export default function ArchiveTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<CoordinatorOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [coordinatorFullName, setCoordinatorFullName] = useState("—");
  const [archiveSegment, setArchiveSegment] = useState<CoordinatorArchiveOrdersSegment | null>(null);
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
      const listOpts = archiveSegment != null ? { segment: archiveSegment } : undefined;
      const [page, me] = await Promise.all([
        coordinatorListOrders(session.accessToken, "archive", listOpts),
        coordinatorMe(session.accessToken).catch(() => null)
      ]);
      setOrders(page.orders);
      setNextCursor(page.nextCursor);
      if (me?.fullName?.trim()) setCoordinatorFullName(me.fullName.trim());
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
  }, [router, archiveSegment]);

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
        archiveSegment != null
          ? { cursor: nextCursor, segment: archiveSegment }
          : { cursor: nextCursor };
      const page = await coordinatorListOrders(session.accessToken, "archive", listOpts);
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
  }, [nextCursor, loading, refreshing, router, archiveSegment]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  if (loading && orders.length === 0) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>جاري تحميل الأرشيف…</Text>
      </View>
    );
  }

  const listBottomPad = coordinatorTabBarOuterHeight(insets.bottom) + 24;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>الأرشيف</Text>
      <Text style={styles.subtitle}>
        صفِّ بين المكتملة والملغاة. مرّر للأسفل لتحميل المزيد (10 لكل دفعة).
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
            { key: "completed" as const, label: "مكتملة" },
            { key: "cancelled" as const, label: "ملغاة" }
          ] as const
        ).map(({ key, label }) => {
          const active = key === "all" ? archiveSegment === null : archiveSegment === key;
          return (
            <Pressable
              key={key}
              onPress={() => setArchiveSegment(key === "all" ? null : key)}
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
        renderItem={({ item }) => (
          <CoordinatorOrderCard
            item={item}
            archiveMode
            coordinatorFullName={coordinatorFullName}
            onOrderUpdated={(row) =>
              setOrders((prev) => prev.map((o) => (o.id === row.id ? row : o)))
            }
          />
        )}
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
            {archiveSegment === null
              ? "لا توجد طلبات في الأرشيف بعد."
              : archiveSegment === "completed"
                ? "لا توجد طلبات مكتملة ضمن هذا التصفية."
                : "لا توجد طلبات ملغاة ضمن هذا التصفية."}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingTop: 56,
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
  empty: {
    color: "#64748b",
    ...rtlText,
    marginTop: 40,
    fontSize: 15,
    lineHeight: 24
  }
});
