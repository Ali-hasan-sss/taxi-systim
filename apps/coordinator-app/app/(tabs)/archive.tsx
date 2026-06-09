import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
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
  const { theme } = useTheme();
  const styles = useThemedStyles((t) => ({
    root: {
      flex: 1,
      backgroundColor: t.colors.background,
      paddingTop: 56,
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
      ...rtlText,
      width: "100%"
    },
    title: {
      fontSize: 22,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 8,
      paddingHorizontal: 20
    },
    subtitle: {
      fontSize: 13,
      color: t.colors.textMuted,
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
      flexDirection: "row" as const,
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 4,
      alignItems: "center" as const
    },
    filterChip: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 22,
      backgroundColor: t.colors.filterBg,
      borderWidth: 1,
      borderColor: t.colors.filterBorder,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      minHeight: 44
    },
    filterChipActive: {
      backgroundColor: t.colors.filterActiveBg,
      borderColor: t.colors.filterActiveBorder
    },
    filterChipPressed: {
      opacity: 0.9
    },
    filterChipText: {
      color: t.colors.filterText,
      fontWeight: "700" as const,
      fontSize: 13,
      lineHeight: 22,
      ...rtlText,
      ...Platform.select({ android: { includeFontPadding: false }, default: {} })
    },
    filterChipTextActive: {
      color: t.colors.filterActiveText
    },
    error: {
      color: t.colors.danger,
      ...rtlText,
      paddingHorizontal: 20,
      marginBottom: 8
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
    empty: {
      color: t.colors.textSubtle,
      ...rtlText,
      marginTop: 40,
      fontSize: 15,
      lineHeight: 24
    }
  }));
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
      <View style={[styles.centered, { paddingTop: 12 }]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>جاري تحميل الأرشيف…</Text>
      </View>
    );
  }

  const listBottomPad = coordinatorTabBarOuterHeight(insets.bottom) + 24;

  return (
    <View style={[styles.root, { paddingTop: 8 }]}>
      <Text style={styles.title}>الأرشيف</Text>
      
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.accent} />}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.listFooterLoader}>
              <ActivityIndicator color={theme.colors.accent} />
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

