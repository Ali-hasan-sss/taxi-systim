import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverFinesLedgerModal } from "../../src/components/DriverFinesLedgerModal";
import { DriverScreenBackground } from "../../src/components/DriverScreenBackground";
import { type DriverOrderStats, fetchDriverOrderStats } from "../../src/lib/api";
import { rtlText } from "../../src/lib/rtl-text";
import { clearDriverSession, getDriverFullName, getDriverSession } from "../../src/lib/session";
import { driverTabBarOuterHeight } from "../../src/lib/tab-bar-inset";

const emptyStats: DriverOrderStats = {
  active: 0,
  pending: 0,
  completed: 0,
  cancelled: 0,
  stuckToday: 0,
  commissionDueTodaySyria: 0,
  unpaidCommissionAmount: 0,
  fineAmount: 0
};

function StatCard({
  label,
  detail,
  value,
  accent,
  formatMoney,
  onPress,
  pressHint
}: {
  label: string;
  detail?: string;
  value: number;
  accent: string;
  formatMoney?: boolean;
  onPress?: () => void;
  pressHint?: string;
}) {
  const styles = useThemedStyles((t) => ({
    statCard: {
      width: "48%",
      backgroundColor: t.colors.surfaceCard,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      marginBottom: 4,
      alignItems: "flex-end" as const,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4
    },
    statValue: {
      fontSize: 28,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    statLabel: {
      fontSize: 14,
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
    pressHint: {
      fontSize: 11,
      fontWeight: "700" as const,
      color: t.colors.warning,
      ...rtlText,
      marginTop: 6,
      textAlign: "right" as const
    }
  }));

  const valueText = formatMoney
    ? value.toLocaleString("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : String(value);

  const content = (
    <>
      <Text style={styles.statValue}>{valueText}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
      {onPress && pressHint ? <Text style={styles.pressHint}>{pressHint}</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={[styles.statCard, { borderColor: accent }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label} — ${pressHint ?? "عرض التفاصيل"}`}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.statCard, { borderColor: accent }]}>{content}</View>;
}

function authFailureMessage(msg: string): boolean {
  return /Unauthorized|غير مصرح|Forbidden|401|403|تجديد الجلسة|انتهت صلاحية الجلسة|Invalid refresh/i.test(msg);
}

export default function DriverHomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [stats, setStats] = useState<DriverOrderStats>(emptyStats);
  const [loadingStats, setLoadingStats] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [finesOpen, setFinesOpen] = useState(false);

  const styles = useThemedStyles((t) => ({
    safe: {
      flex: 1,
      backgroundColor: "transparent"
    },
    scrollView: {
      flex: 1,
      width: "100%",
      direction: "rtl" as const
    },
    scroll: {
      paddingHorizontal: 20,
      paddingTop: 8,
      alignItems: "stretch" as const,
      direction: "rtl" as const
    },
    hero: {
      backgroundColor: t.colors.statHeroBg,
      borderRadius: 22,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: t.colors.statHeroBorder,
      alignItems: "stretch" as const,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 18,
      elevation: 8
    },
    heroTitle: {
      fontSize: 20,
      fontWeight: "800" as const,
      color: t.colors.statHeroText,
      ...rtlText,
      marginBottom: 8,
      textAlign: "right" as const
    },
    greeting: {
      fontSize: 16,
      color: t.colors.statHeroSubtext,
      ...rtlText,
      textAlign: "right" as const
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "700" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 10,
      marginTop: 8,
      textAlign: "right" as const
    },
    error: {
      color: t.colors.danger,
      ...rtlText,
      marginBottom: 12,
      textAlign: "right" as const
    },
    loader: {
      marginVertical: 24
    },
    statsGrid: {
      flexDirection: "row-reverse" as const,
      flexWrap: "wrap" as const,
      gap: 12,
      justifyContent: "space-between" as const
    }
  }));

  const goToLogin = useCallback(async () => {
    await clearDriverSession();
    router.replace("/login");
  }, [router]);

  const loadStats = useCallback(async () => {
    const session = await getDriverSession();
    if (!session) {
      await goToLogin();
      return;
    }
    const storedName = await getDriverFullName();
    if (storedName) setDriverName(storedName);
    setLoadingStats(true);
    setError(null);
    try {
      const s = await fetchDriverOrderStats(session.accessToken);
      setStats(s);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ";
      setError(msg);
      if (authFailureMessage(msg)) {
        await goToLogin();
      }
    } finally {
      setLoadingStats(false);
    }
  }, [goToLogin]);

  useFocusEffect(
    useCallback(() => {
      void loadStats();
    }, [loadStats])
  );

  const scrollBottomPad = driverTabBarOuterHeight(insets.bottom) + 20;

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <DriverScreenBackground>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPad }]}
          style={styles.scrollView}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>الرئيسية</Text>
            {driverName ? <Text style={styles.greeting}>مرحبًا، {driverName}</Text> : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionTitle}>إحصائيات طلباتي اليوم</Text>

          {loadingStats ? (
            <ActivityIndicator style={styles.loader} color={theme.colors.primary} size="large" />
          ) : (
            <View style={styles.statsGrid}>
              <StatCard label="طلبات نشطة" detail="المسندة إليك" value={stats.active} accent={theme.colors.primary} />
              <StatCard label="طلبات معلقة" detail="قبل القبول إن وُجدت" value={stats.pending} accent={theme.colors.warning} />
              <StatCard
                label="عمولات غير مسددة"
                detail="عمولات + غرامات − تعويضات"
                value={stats.unpaidCommissionAmount}
                accent={theme.colors.busy}
                formatMoney
              />
              <StatCard
                label="مجموع الغرامات"
                detail="كل الغرامات المسجّلة"
                value={stats.fineAmount}
                accent={theme.colors.danger}
                formatMoney
                onPress={() => setFinesOpen(true)}
                pressHint="اضغط لعرض السجل"
              />
              <StatCard
                label="عمولة اليوم (مستحقة)"
                detail="طلبات أُكملت اليوم — غير مسددة بعد"
                value={stats.commissionDueTodaySyria}
                accent={theme.colors.accent}
                formatMoney
              />
              <StatCard label="طلبات مكتملة" value={stats.completed} accent={theme.colors.success} />
              <StatCard label="طلبات ملغاة" value={stats.cancelled} accent={theme.colors.danger} />
            </View>
          )}
        </ScrollView>
      </DriverScreenBackground>

      <DriverFinesLedgerModal
        open={finesOpen}
        onClose={() => setFinesOpen(false)}
        onAuthFailure={() => {
          setFinesOpen(false);
          void goToLogin();
        }}
      />
    </SafeAreaView>
  );
}
