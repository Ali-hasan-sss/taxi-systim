import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { type DriverOrderStats, fetchDriverOrderStats } from "../../src/lib/api";
import { clearDriverSession, getDriverFullName, getDriverSession } from "../../src/lib/session";
import { rtlText } from "../../src/lib/rtl-text";
import { driverTabBarOuterHeight } from "../../src/lib/tab-bar-inset";

const emptyStats: DriverOrderStats = {
  active: 0,
  pending: 0,
  completed: 0,
  cancelled: 0,
  stuckToday: 0,
  commissionDueTodaySyria: 0
};

function StatCard({
  label,
  detail,
  value,
  accent,
  formatMoney
}: {
  label: string;
  detail?: string;
  value: number;
  accent: string;
  /** عرض مبلغ بدون أصفار زائدة بعد الفاصلة (مثلاً 10 لا 10٫00) */
  formatMoney?: boolean;
}) {
  const valueText = formatMoney
    ? value.toLocaleString("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : String(value);
  return (
    <View style={[styles.statCard, { borderColor: accent }]}>
      <Text style={styles.statValue}>{valueText}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
    </View>
  );
}

function authFailureMessage(msg: string): boolean {
  return /Unauthorized|غير مصرح|Forbidden|401|403|تجديد الجلسة|انتهت صلاحية الجلسة|Invalid refresh/i.test(msg);
}

export default function DriverHomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<DriverOrderStats>(emptyStats);
  const [loadingStats, setLoadingStats] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  /* بدون حافة سفلية: شريط التبويب يستعمل insets.bottom بالفعل — إضافتها هنا تكرّر المسافة على بعض الأجهزة */
  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
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
          <ActivityIndicator style={styles.loader} color="#2563eb" size="large" />
        ) : (
          <View style={styles.statsGrid}>
            <StatCard label="طلبات نشطة" detail="المسندة إليك" value={stats.active} accent="#2563eb" />
            <StatCard label="طلبات معلقة" detail="قبل القبول إن وُجدت" value={stats.pending} accent="#b45309" />
            <StatCard label="متعثرة اليوم" detail="لم أجد الزبون" value={stats.stuckToday} accent="#c2410c" />
            <StatCard
              label="عمولة اليوم (مستحقة)"
              detail="طلبات أُكملت اليوم — غير مسددة بعد"
              value={stats.commissionDueTodaySyria}
              accent="#7c3aed"
              formatMoney
            />
            <StatCard label="طلبات مكتملة" value={stats.completed} accent="#15803d" />
            <StatCard label="طلبات ملغاة" value={stats.cancelled} accent="#991b1b" />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  scrollView: {
    flex: 1,
    width: "100%",
    direction: "rtl"
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    alignItems: "stretch",
    direction: "rtl"
  },
  hero: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "stretch"
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText,
    marginBottom: 8
  },
  greeting: {
    fontSize: 16,
    color: "#94a3b8",
    ...rtlText
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
    ...rtlText,
    marginBottom: 10,
    marginTop: 8
  },
  hint: {
    fontSize: 12,
    color: "#64748b",
    ...rtlText,
    lineHeight: 18,
    marginBottom: 16
  },
  error: {
    color: "#dc2626",
    ...rtlText,
    marginBottom: 12
  },
  loader: {
    marginVertical: 24
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between"
  },
  statCard: {
    width: "48%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 4,
    alignItems: "stretch",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
    ...rtlText
  },
  statLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    ...rtlText,
    marginTop: 6
  },
  statDetail: {
    fontSize: 11,
    color: "#64748b",
    ...rtlText,
    marginTop: 4
  }
});
