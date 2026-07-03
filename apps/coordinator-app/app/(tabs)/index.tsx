import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type CoordinatorOrderStats,
  coordinatorMe,
  coordinatorOrderStats
} from "../../src/lib/api";
import { clearSession, getSession } from "../../src/lib/session";
import { isCoordinatorAuthFailureMessage } from "../../src/lib/coordinator-auth";
import { debounce } from "../../src/lib/debounce";
import { coordinatorTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { rtlText } from "../../src/lib/rtl-text";
import { useCoordinatorStore } from "../../src/store";

/** عرض تاريخ ملخص «اليوم» (YYYY-MM-DD من الخادم) بصيغة عربية بتوقيت سوريا */
function formatSyriaDayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const anchor = Date.UTC(y, mo - 1, d, 12, 0, 0);
  try {
    return new Intl.DateTimeFormat("ar-SY", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Damascus"
    }).format(new Date(anchor));
  } catch {
    return ymd;
  }
}

export default function HomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles((t) => ({
    rtlScreen: {
      direction: "rtl" as const,
      alignItems: "stretch" as const
    },
    shell: {
      flex: 1,
      backgroundColor: t.colors.background,
      direction: "rtl" as const
    },
    scrollView: {
      flex: 1,
      alignSelf: "stretch" as const,
      width: "100%",
      direction: "rtl" as const
    },
    scroll: {
      flexGrow: 1,
      padding: 20,
      alignItems: "stretch" as const,
      direction: "rtl" as const,
      width: "100%"
    },
    hero: {
      backgroundColor: t.colors.surface,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: "stretch" as const
    },
    greeting: {
      fontSize: 22,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "800" as const,
      color: t.colors.textSecondary,
      ...rtlText,
      marginBottom: 8
    },
    sectionHint: {
      fontSize: 14,
      color: t.colors.textMuted,
      ...rtlText,
      marginBottom: 16,
      lineHeight: 22
    },
    statsDayLabel: {
      fontSize: 13,
      fontWeight: "700" as const,
      color: t.colors.textSubtle,
      ...rtlText,
      marginBottom: 14,
      marginTop: -6
    },
    statsGrid: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 12,
      justifyContent: "space-between" as const
    },
    statTile: {
      width: "48%",
      backgroundColor: t.colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      marginBottom: 4,
      alignItems: "stretch" as const
    },
    statTilePending: {
      borderColor: t.colors.warning
    },
    statTileActive: {
      borderColor: t.colors.primary
    },
    statTileStuck: {
      borderColor: t.colors.busy
    },
    statTileDone: {
      borderColor: t.colors.success
    },
    statTileCancelled: {
      borderColor: t.colors.danger
    },
    tileValue: {
      fontSize: 28,
      fontWeight: "800" as const,
      color: t.colors.accent,
      ...rtlText
    },
    tileLabel: {
      marginTop: 6,
      fontSize: 13,
      color: t.colors.textMuted,
      ...rtlText,
      fontWeight: "700" as const
    }
  }));

  const [name, setName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const orderRefreshTick = useCoordinatorStore((s) => s.orderRefreshTick);
  const [orderStats, setOrderStats] = useState<CoordinatorOrderStats>({
    active: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
    stuckToday: 0
  });

  const loadDashboard = useCallback(async () => {
    const session = await getSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }
    const [me, stats] = await Promise.all([
      coordinatorMe(session.accessToken),
      coordinatorOrderStats(session.accessToken)
    ]);
    setName(me.fullName);
    setOrderStats(stats);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let ok = true;
      (async () => {
        try {
          await loadDashboard();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (ok && isCoordinatorAuthFailureMessage(msg)) {
            await clearSession();
            router.replace("/login");
          }
        }
      })();
      return () => {
        ok = false;
      };
    }, [loadDashboard, router])
  );

  const orderRefreshDebounceRef = useRef(
    debounce(() => {
      void loadDashboard().catch(() => {
        /* أخطاء الشبكة المؤقتة لا تُسجّل خروجًا من الشاشة الرئيسية */
      });
    }, 600)
  );

  const orderRefreshTickRef = useRef(orderRefreshTick);
  useEffect(() => {
    if (orderRefreshTickRef.current === orderRefreshTick) return;
    orderRefreshTickRef.current = orderRefreshTick;
    orderRefreshDebounceRef.current();
  }, [orderRefreshTick]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadDashboard();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (isCoordinatorAuthFailureMessage(msg)) {
        await clearSession();
        router.replace("/login");
      }
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard, router]);

  const homeScrollBottomPad = 40 + coordinatorTabBarOuterHeight(insets.bottom);

  return (
    <View style={styles.shell}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scroll, { paddingBottom: homeScrollBottomPad }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.greeting}>مرحبًا، {name || "..."}</Text>
        </View>

      
        <Text style={styles.sectionTitle}>ملخص طلباتي اليوم</Text>

        {orderStats.summaryDaySyria ? (
          <Text style={styles.statsDayLabel}>{formatSyriaDayLabel(orderStats.summaryDaySyria)}</Text>
        ) : null}

        <View style={styles.statsGrid}>
          <View style={[styles.statTile, styles.statTilePending]}>
            <Text style={styles.tileValue}>{orderStats.pending}</Text>
            <Text style={styles.tileLabel}>طلبات معلقة</Text>
          </View>
          <View style={[styles.statTile, styles.statTileActive]}>
            <Text style={styles.tileValue}>{orderStats.active}</Text>
            <Text style={styles.tileLabel}>رحلات نشطة</Text>
          </View>
          <View style={[styles.statTile, styles.statTileStuck]}>
            <Text style={styles.tileValue}>{orderStats.stuckToday}</Text>
            <Text style={styles.tileLabel}>متعثرة اليوم</Text>
          </View>
          <View style={[styles.statTile, styles.statTileDone]}>
            <Text style={styles.tileValue}>{orderStats.completed}</Text>
            <Text style={styles.tileLabel}>مكتملة</Text>
          </View>
          <View style={[styles.statTile, styles.statTileCancelled]}>
            <Text style={styles.tileValue}>{orderStats.cancelled}</Text>
            <Text style={styles.tileLabel}>ملغاة</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
