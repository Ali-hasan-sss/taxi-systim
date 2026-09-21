import { themedRefreshProps, useTheme, useThemedStyles } from "@taxi/expo-theme";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverCompensationsLedgerModal } from "../../src/components/DriverCompensationsLedgerModal";
import { DriverFinesLedgerModal } from "../../src/components/DriverFinesLedgerModal";
import { DriverHomeSkeleton } from "../../src/components/driver-skeletons";
import { DriverTabScreen } from "../../src/components/DriverScreenBackground";
import { type DriverOrderStats, fetchDriverOrderStats } from "../../src/lib/api";
import { rtlText } from "../../src/lib/rtl-text";
import { clearDriverSession, getDriverSession } from "../../src/lib/session";
import { driverTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { useDriverStore } from "../../src/store";

const emptyStats: DriverOrderStats = {
  active: 0,
  pending: 0,
  completed: 0,
  cancelled: 0,
  stuckToday: 0,
  commissionDueTodaySyria: 0,
  unpaidCommissionAmount: 0,
  compensationAmount: 0,
  fineAmount: 0,
  amountOwed: 0
};

function formatMoney(value: number) {
  return value.toLocaleString("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function StatCard({
  label,
  detail,
  value,
  accent,
  onPress,
  pressHint,
  wide
}: {
  label: string;
  detail?: string;
  value: number;
  accent: string;
  onPress?: () => void;
  pressHint?: string;
  wide?: boolean;
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
      fontSize: 26,
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

  const content = (
    <>
      <Text style={styles.statValue}>{formatMoney(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
      {onPress && pressHint ? <Text style={styles.pressHint}>{pressHint}</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={[styles.statCard, { borderColor: accent }, wide ? { width: "100%" } : null]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label} — ${pressHint ?? "عرض التفاصيل"}`}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.statCard, { borderColor: accent }, wide ? { width: "100%" } : null]}>{content}</View>;
}

function authFailureMessage(msg: string): boolean {
  return /Unauthorized|غير مصرح|Forbidden|401|403|تجديد الجلسة|انتهت صلاحية الجلسة|Invalid refresh/i.test(msg);
}

export default function DriverHomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [stats, setStats] = useState<DriverOrderStats>(emptyStats);
  const [loadingStats, setLoadingStats] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finesOpen, setFinesOpen] = useState(false);
  const [compensationsOpen, setCompensationsOpen] = useState(false);
  const applyDebtWorkState = useDriverStore((s) => s.applyDebtWorkState);
  const readyRef = useRef(false);

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
    statsGrid: {
      flexDirection: "row-reverse" as const,
      flexWrap: "wrap" as const,
      gap: 12,
      justifyContent: "space-between" as const
    },
    owedCard: {
      width: "100%",
      borderRadius: 20,
      padding: 20,
      borderWidth: 2,
      marginBottom: 4,
      alignItems: "flex-end" as const,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 6
    },
    owedLabel: {
      fontSize: 15,
      fontWeight: "800" as const,
      ...rtlText,
      textAlign: "right" as const
    },
    owedValue: {
      fontSize: 36,
      fontWeight: "800" as const,
      marginTop: 8,
      ...rtlText,
      textAlign: "right" as const
    },
    owedDetail: {
      fontSize: 12,
      marginTop: 8,
      ...rtlText,
      textAlign: "right" as const,
      lineHeight: 18
    },
    owedNotice: {
      fontSize: 13,
      fontWeight: "800" as const,
      marginTop: 12,
      ...rtlText,
      textAlign: "right" as const,
      lineHeight: 20
    }
  }));

  const goToLogin = useCallback(async () => {
    await clearDriverSession();
    router.replace("/login");
  }, [router]);

  const loadStats = useCallback(async (isPull = false) => {
    const session = await getDriverSession();
    if (!session) {
      await goToLogin();
      return;
    }
    if (isPull) setRefreshing(true);
    else if (!readyRef.current) setLoadingStats(true);
    setError(null);
    try {
      const s = await fetchDriverOrderStats(session.accessToken);
      setStats(s);
      applyDebtWorkState(s);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ";
      setError(msg);
      if (authFailureMessage(msg)) {
        await goToLogin();
      }
    } finally {
      readyRef.current = true;
      setLoadingStats(false);
      setRefreshing(false);
    }
  }, [goToLogin, applyDebtWorkState]);

  useFocusEffect(
    useCallback(() => {
      void loadStats();
    }, [loadStats])
  );

  const scrollBottomPad = driverTabBarOuterHeight(insets.bottom) + 20;
  const owed = stats.amountOwed;
  const owedCredit = owed < 0;
  const owedBlocked = Boolean(stats.workBlocked);
  const owedWarning = Boolean(stats.debtWarning) && !owedBlocked;
  const owedNotice = owedBlocked
    ? stats.workBlockMessage
    : owedWarning
      ? stats.debtWarningMessage
      : null;
  const owedLabel = owedCredit ? "رصيد تعويض" : "المبلغ المترتب عليك";
  const owedDetail = owedCredit
    ? "التعويض أكبر من العمولات والغرامات — سيتم خصمه من عمولاتك لاحقاً"
    : "العمولات والغرامات غير المسددة − التعويض غير المستخدم";
  const owedOverWarn = owed >= 1700;
  const owedCardColors = owedCredit
    ? {
        backgroundColor: theme.colors.successBg,
        borderColor: theme.colors.success,
        label: theme.colors.successText,
        value: theme.colors.success,
        detail: theme.colors.successText
      }
    : owedOverWarn
      ? {
          backgroundColor: theme.colors.dangerBg,
          borderColor: theme.colors.danger,
          label: theme.colors.dangerText,
          value: theme.colors.danger,
          detail: theme.colors.dangerText
        }
      : {
          backgroundColor: theme.colors.warningBg,
          borderColor: theme.colors.warning,
          label: theme.colors.warningText,
          value: theme.colors.warning,
          detail: theme.colors.warningText
        };

  return (
    <DriverTabScreen>
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPad }]}
          style={styles.scrollView}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadStats(true)}
              {...themedRefreshProps(theme)}
            />
          }
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionTitle}>الملخص المالي</Text>

          {loadingStats && !refreshing ? (
            <DriverHomeSkeleton />
          ) : (
            <View style={styles.statsGrid}>
              <View
                style={[
                  styles.owedCard,
                  {
                    backgroundColor: owedCardColors.backgroundColor,
                    borderColor: owedCardColors.borderColor
                  }
                ]}
              >
                <Text style={[styles.owedLabel, { color: owedCardColors.label }]}>
                  {owedLabel}
                </Text>
                <Text style={[styles.owedValue, { color: owedCardColors.value }]}>
                  {formatMoney(owed)}
                </Text>
                <Text style={[styles.owedDetail, { color: owedCardColors.detail }]}>
                  {owedDetail}
                </Text>
                {owedNotice ? (
                  <Text style={[styles.owedNotice, { color: owedCardColors.label }]}>
                    {owedNotice}
                  </Text>
                ) : null}
              </View>

              <StatCard
                label="العمولة المترتبة"
                detail="غير المدفوعة فقط"
                value={stats.unpaidCommissionAmount}
                accent={theme.colors.busy}
              />
              <StatCard
                label="التعويضات"
                detail="غير المستخدم بعد التسديد"
                value={stats.compensationAmount}
                accent={theme.colors.success}
                onPress={() => setCompensationsOpen(true)}
                pressHint="اضغط لعرض السجل"
              />
              <StatCard
                label="الغرامات"
                detail="غير المسددة بعد آخر تسديد"
                value={stats.fineAmount}
                accent={theme.colors.danger}
                onPress={() => setFinesOpen(true)}
                pressHint="اضغط لعرض السجل"
                wide
              />
            </View>
          )}
        </ScrollView>

      <DriverFinesLedgerModal
        open={finesOpen}
        onClose={() => setFinesOpen(false)}
        onAuthFailure={() => {
          setFinesOpen(false);
          void goToLogin();
        }}
      />
      <DriverCompensationsLedgerModal
        open={compensationsOpen}
        onClose={() => setCompensationsOpen(false)}
        onAuthFailure={() => {
          setCompensationsOpen(false);
          void goToLogin();
        }}
      />
    </SafeAreaView>
    </DriverTabScreen>
  );
}
