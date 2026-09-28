import { themedRefreshProps, useTheme, useThemedStyles } from "@taxi/expo-theme";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverCommissionsLedgerModal } from "../../src/components/DriverCommissionsLedgerModal";
import { DriverCompensationsLedgerModal } from "../../src/components/DriverCompensationsLedgerModal";
import { DriverDebtsLedgerModal } from "../../src/components/DriverDebtsLedgerModal";
import { DriverDeductionsLedgerModal } from "../../src/components/DriverDeductionsLedgerModal";
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
  deductionAmount: 0,
  extraDebtAmount: 0,
  amountOwed: 0,
  commissionDebtLimit: 0,
  paymentMode: "POSTPAID"
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
  wide,
  compact,
  hideValue
}: {
  label: string;
  detail?: string;
  value: number;
  accent: string;
  onPress?: () => void;
  pressHint?: string;
  wide?: boolean;
  compact?: boolean;
  hideValue?: boolean;
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
    compactCard: {
      flex: 1,
      width: 0,
      minWidth: 0,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 14,
      marginBottom: 0,
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2
    },
    statValue: {
      fontSize: 26,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    compactValue: {
      fontSize: 18
    },
    statLabel: {
      fontSize: 14,
      fontWeight: "700" as const,
      color: t.colors.textSecondary,
      ...rtlText,
      marginTop: 6,
      textAlign: "right" as const
    },
    compactLabel: {
      fontSize: 12,
      marginTop: 4
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
    },
    compactHint: {
      fontSize: 10,
      marginTop: 4
    }
  }));

  const content = (
    <>
      {hideValue ? null : (
        <Text style={[styles.statValue, compact ? styles.compactValue : null]}>{formatMoney(value)}</Text>
      )}
      <Text style={[styles.statLabel, compact ? styles.compactLabel : null]}>{label}</Text>
      {!compact && detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
      {onPress && pressHint ? (
        <Text style={[styles.pressHint, compact ? styles.compactHint : null]}>{pressHint}</Text>
      ) : null}
    </>
  );

  const cardStyle = [
    styles.statCard,
    { borderColor: accent },
    wide ? { width: "100%" as const } : null,
    compact ? styles.compactCard : null
  ];

  if (onPress) {
    return (
      <Pressable
        style={cardStyle}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label} — ${pressHint ?? "عرض التفاصيل"}`}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{content}</View>;
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
  const [deductionsOpen, setDeductionsOpen] = useState(false);
  const [debtsOpen, setDebtsOpen] = useState(false);
  const [compensationsOpen, setCompensationsOpen] = useState(false);
  const [commissionsOpen, setCommissionsOpen] = useState(false);
  const applyDebtWorkState = useDriverStore((s) => s.applyDebtWorkState);
  const financeRevision = useDriverStore((s) => s.financeRevision);
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
    tripleRow: {
      width: "100%",
      flexDirection: "row-reverse" as const,
      gap: 8
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
    owedLimit: {
      fontSize: 13,
      fontWeight: "800" as const,
      marginTop: 10,
      ...rtlText,
      textAlign: "right" as const
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

  useEffect(() => {
    if (financeRevision <= 0) return;
    void loadStats();
  }, [financeRevision, loadStats]);

  const scrollBottomPad = driverTabBarOuterHeight(insets.bottom) + 20;
  const prepaid = stats.paymentMode === "PREPAID";
  const owed = stats.amountOwed;
  const prepaidCredit = owed < 0 ? -owed : 0;
  const owedCredit = prepaid ? prepaidCredit > 0 : owed < 0;
  const displayOwed = prepaid ? prepaidCredit : owed;
  const owedBlocked = Boolean(stats.workBlocked);
  const owedWarning = Boolean(stats.debtWarning) && !owedBlocked;
  const owedNotice = owedBlocked
    ? stats.workBlockMessage
    : owedWarning
      ? stats.debtWarningMessage
      : null;
  const owedLabel = prepaid ? "الرصيد المسبق" : owedCredit ? "رصيد تعويض" : "المبلغ المترتب عليك";
  const owedDetail = prepaid
    ? owedBlocked
      ? "رصيدك 0 — اشحن رصيدك لتعود للعمل"
      : "تُخصم العمولة من الرصيد ويُضاف التعويض إليه فورًا"
    : owedCredit
      ? "الناتج بعد العمولات والديون والغرامات والخصومات والتعويضات"
      : "الناتج = العمولات + الديون + الغرامات + الخصومات − التعويضات";
  const debtLimit = stats.commissionDebtLimit ?? 0;
  const owedLimitText =
    prepaid || owedCredit || debtLimit <= 0 ? null : `الحد الأعلى لتسديد العمولة: ${formatMoney(debtLimit)} ل.س`;
  const owedCardColors = owedCredit
    ? {
        backgroundColor: theme.colors.successBg,
        borderColor: theme.colors.success,
        label: theme.colors.successText,
        value: theme.colors.success,
        detail: theme.colors.successText
      }
    : owedBlocked
      ? {
          backgroundColor: theme.colors.dangerBg,
          borderColor: theme.colors.danger,
          label: theme.colors.dangerText,
          value: theme.colors.danger,
          detail: theme.colors.dangerText
        }
      : owedWarning
        ? {
            backgroundColor: theme.colors.warningBg,
            borderColor: theme.colors.warning,
            label: theme.colors.warningText,
            value: theme.colors.warning,
            detail: theme.colors.warningText
          }
        : {
            backgroundColor: theme.colors.surfaceCard,
            borderColor: theme.colors.border,
            label: theme.colors.text,
            value: theme.colors.text,
            detail: theme.colors.textSecondary
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
                  {formatMoney(displayOwed)}
                </Text>
                <Text style={[styles.owedDetail, { color: owedCardColors.detail }]}>
                  {owedDetail}
                </Text>
                {owedLimitText ? (
                  <Text style={[styles.owedLimit, { color: owedCardColors.label }]}>
                    {owedLimitText}
                  </Text>
                ) : null}
                {owedNotice ? (
                  <Text style={[styles.owedNotice, { color: owedCardColors.label }]}>
                    {owedNotice}
                  </Text>
                ) : null}
              </View>

              <StatCard
                label="العمولة المترتبة"
                detail={prepaid ? "تُخصم من الرصيد — اضغط للسجل" : "غير المدفوعة فقط"}
                value={prepaid ? 0 : stats.unpaidCommissionAmount}
                accent={theme.colors.busy}
                hideValue={prepaid}
                onPress={() => setCommissionsOpen(true)}
                pressHint="السجل"
              />
              <StatCard
                label="التعويضات"
                detail={prepaid ? "تُضاف إلى الرصيد — اضغط للسجل" : "المجموع — الناتج في المترتب"}
                value={stats.compensationAmount}
                accent={theme.colors.success}
                hideValue={prepaid}
                onPress={() => setCompensationsOpen(true)}
                pressHint="السجل"
              />
              <View style={styles.tripleRow}>
                <StatCard
                  compact
                  label="الديون"
                  value={stats.extraDebtAmount ?? 0}
                  accent={theme.colors.info}
                  onPress={() => setDebtsOpen(true)}
                  pressHint="السجل"
                />
                <StatCard
                  compact
                  label="الخصومات"
                  value={stats.deductionAmount ?? 0}
                  accent={theme.colors.warning}
                  onPress={() => setDeductionsOpen(true)}
                  pressHint="السجل"
                />
                <StatCard
                  compact
                  label="الغرامات"
                  value={stats.fineAmount}
                  accent={theme.colors.danger}
                  onPress={() => setFinesOpen(true)}
                  pressHint="السجل"
                />
              </View>
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
      <DriverDeductionsLedgerModal
        open={deductionsOpen}
        onClose={() => setDeductionsOpen(false)}
        onAuthFailure={() => {
          setDeductionsOpen(false);
          void goToLogin();
        }}
      />
      <DriverDebtsLedgerModal
        open={debtsOpen}
        onClose={() => setDebtsOpen(false)}
        onAuthFailure={() => {
          setDebtsOpen(false);
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
      <DriverCommissionsLedgerModal
        open={commissionsOpen}
        onClose={() => setCommissionsOpen(false)}
        onAuthFailure={() => {
          setCommissionsOpen(false);
          void goToLogin();
        }}
      />
    </SafeAreaView>
    </DriverTabScreen>
  );
}
