import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CoordinatorOrderCard } from "../../src/components/CoordinatorOrderCard";
import { type CoordinatorOrderRow, coordinatorListOrders } from "../../src/lib/api";
import { clearSession, getSession } from "../../src/lib/session";

export default function ArchiveTab() {
  const router = useRouter();
  const [orders, setOrders] = useState<CoordinatorOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const page = await coordinatorListOrders(session.accessToken, "archive");
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
      const page = await coordinatorListOrders(session.accessToken, "archive", { cursor: nextCursor });
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

  if (loading && orders.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>جاري تحميل الأرشيف…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>الأرشيف</Text>
      <Text style={styles.subtitle}>
        الطلبات المكتملة والملغاة. مرّر للأسفل لتحميل المزيد (10 لكل دفعة).
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CoordinatorOrderCard item={item} />}
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
          <Text style={styles.empty}>لا توجد طلبات مكتملة أو ملغاة في الأرشيف بعد.</Text>
        }
      />
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
  empty: {
    color: "#64748b",
    textAlign: "center",
    marginTop: 40,
    fontSize: 15,
    lineHeight: 24
  }
});
