import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useFocusEffect } from "expo-router";
import { type DriverOrderStats, driverLogin, fetchDriverOrderStats } from "../src/lib/api";
import { clearDriverSession, getDriverAccessToken, getDriverFullName, setDriverSession } from "../src/lib/session";
import { useDriverStore } from "../src/store";

const emptyStats: DriverOrderStats = { active: 0, pending: 0, completed: 0, cancelled: 0 };

function StatCard({
  label,
  detail,
  value,
  accent
}: {
  label: string;
  detail?: string;
  value: number;
  accent: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: accent }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
    </View>
  );
}

export default function DriverHome() {
  const { isOnline, setOnline } = useDriverStore();
  const [stats, setStats] = useState<DriverOrderStats>(emptyStats);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    const token = await getDriverAccessToken();
    if (!token) {
      setLoggedIn(false);
      setStats(emptyStats);
      return;
    }
    setLoggedIn(true);
    const storedName = await getDriverFullName();
    if (storedName) setDriverName(storedName);
    setLoadingStats(true);
    setError(null);
    try {
      const s = await fetchDriverOrderStats(token);
      setStats(s);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ";
      setError(msg);
      if (/Unauthorized|غير مصرح|Forbidden|401|403/i.test(msg)) {
        await clearDriverSession();
        setLoggedIn(false);
        setStats(emptyStats);
        setDriverName("");
      }
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadStats();
    }, [loadStats])
  );

  const onLogin = async () => {
    setLoginLoading(true);
    setError(null);
    try {
      const { accessToken, fullName } = await driverLogin(phone.trim(), password);
      await setDriverSession(accessToken, fullName);
      setPassword("");
      setDriverName(fullName);
      setLoggedIn(true);
      setLoadingStats(true);
      try {
        const s = await fetchDriverOrderStats(accessToken);
        setStats(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تحميل الإحصائيات");
        setStats(emptyStats);
      } finally {
        setLoadingStats(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الدخول");
    } finally {
      setLoginLoading(false);
    }
  };

  const onLogout = async () => {
    await clearDriverSession();
    setLoggedIn(false);
    setStats(emptyStats);
    setDriverName("");
    setError(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} style={styles.root}>
      <Text style={styles.title}>الرئيسية</Text>
      {driverName ? <Text style={styles.greeting}>مرحبًا، {driverName}</Text> : null}

      {!loggedIn ? (
        <View style={styles.loginBox}>
          <Text style={styles.sectionTitle}>تسجيل الدخول</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="رقم الهاتف"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            keyboardType="phone-pad"
            style={styles.input}
            textAlign="right"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="كلمة المرور"
            placeholderTextColor="#64748b"
            secureTextEntry
            style={styles.input}
            textAlign="right"
          />
          <Pressable
            style={[styles.btnPrimary, loginLoading && styles.btnDisabled]}
            onPress={() => void onLogin()}
            disabled={loginLoading}
          >
            {loginLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryText}>دخول</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.rowBetween}>
          <Pressable style={styles.btnGhost} onPress={() => void onLogout()}>
            <Text style={styles.btnGhostText}>خروج</Text>
          </Pressable>
          <Pressable
            style={[styles.btnOnline, isOnline && styles.btnOnlineOn]}
            onPress={() => setOnline(!isOnline)}
          >
            <Text style={styles.btnOnlineText}>{isOnline ? "متصل" : "غير متصل"}</Text>
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>إحصائيات طلباتي</Text>
      <Text style={styles.hint}>
        تُحسب الطلبات المسندة إليك فقط: النشطة (مقبولة / وصل / بدأت)، المعلقة (في انتظار القبول إن وُجدت)، ثم
        المكتملة والملغاة.
      </Text>

      {loadingStats && loggedIn ? (
        <ActivityIndicator style={styles.loader} color="#38bdf8" size="large" />
      ) : (
        <View style={styles.statsGrid}>
          <StatCard
            label="طلبات نشطة"
            detail="قيد التنفيذ"
            value={stats.active}
            accent="#2563eb"
          />
          <StatCard label="طلبات معلقة" detail="قبل القبول إن وُجدت" value={stats.pending} accent="#b45309" />
          <StatCard label="طلبات مكتملة" value={stats.completed} accent="#15803d" />
          <StatCard label="طلبات ملغاة" value={stats.cancelled} accent="#991b1b" />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a"
  },
  scroll: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 32
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#f8fafc",
    textAlign: "right",
    marginBottom: 8
  },
  greeting: {
    fontSize: 16,
    color: "#94a3b8",
    textAlign: "right",
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#e2e8f0",
    textAlign: "right",
    marginBottom: 10,
    marginTop: 8
  },
  hint: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "right",
    lineHeight: 18,
    marginBottom: 16
  },
  loginBox: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 20
  },
  input: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f8fafc",
    marginBottom: 10,
    fontSize: 15
  },
  btnPrimary: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16
  },
  btnDisabled: {
    opacity: 0.6
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    gap: 12
  },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  btnGhostText: {
    color: "#94a3b8",
    fontWeight: "700"
  },
  btnOnline: {
    backgroundColor: "#334155",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10
  },
  btnOnlineOn: {
    backgroundColor: "#14532d"
  },
  btnOnlineText: {
    color: "#f8fafc",
    fontWeight: "800"
  },
  error: {
    color: "#f87171",
    textAlign: "right",
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
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 4
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f8fafc",
    textAlign: "right"
  },
  statLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#cbd5e1",
    textAlign: "right",
    marginTop: 6
  },
  statDetail: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "right",
    marginTop: 4
  }
});
