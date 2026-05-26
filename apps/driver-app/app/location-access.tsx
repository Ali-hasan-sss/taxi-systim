import { useCallback, useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppState, ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { DriverScreenBackground } from "../src/components/DriverScreenBackground";
import {
  getDriverLocationAccessState,
  isDriverLocationReady,
  openDriverAppSettings,
  requestDriverLocationAccess,
  type DriverLocationAccessState
} from "../src/lib/location-access";
import { rtlText } from "../src/lib/rtl-text";
import { getDriverSession } from "../src/lib/session";
import { useDriverStore } from "../src/store";

const initialState: DriverLocationAccessState = {
  permissionGranted: false,
  servicesEnabled: false
};

export default function DriverLocationAccessScreen() {
  const router = useRouter();
  const setOnline = useDriverStore((s) => s.setOnline);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<DriverLocationAccessState>(initialState);
  const [error, setError] = useState<string | null>(null);

  const resolveAccess = useCallback(
    async (mode: "check" | "request") => {
      setLoading(true);
      setError(null);
      try {
        const session = await getDriverSession();
        if (!session?.accessToken) {
          setOnline(false);
          router.replace("/login");
          return;
        }

        const nextState =
          mode === "request" ? await requestDriverLocationAccess() : await getDriverLocationAccessState();

        if (isDriverLocationReady(nextState)) {
          setOnline(true);
          router.replace("/(tabs)");
          return;
        }

        setOnline(false);
        setState(nextState);
      } catch (e) {
        setOnline(false);
        setError(e instanceof Error ? e.message : "تعذر التحقق من صلاحية الموقع.");
      } finally {
        setLoading(false);
      }
    },
    [router, setOnline]
  );

  useEffect(() => {
    void resolveAccess("request");
    const sub = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        void resolveAccess("check");
      }
    });
    return () => {
      sub.remove();
    };
  }, [resolveAccess]);

  const permissionMissing = !state.permissionGranted;
  const servicesMissing = state.permissionGranted && !state.servicesEnabled;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <DriverScreenBackground variant="auth">
        <View style={styles.wrap}>
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="location-outline" size={34} color="#2563eb" />
            </View>
            <Text style={styles.title}>تفعيل الموقع مطلوب</Text>
            <Text style={styles.subtitle}>
              لا يمكن الدخول إلى شاشات تطبيق السائق قبل منح صلاحية الموقع وتفعيل خدمة تحديد الموقع على الجهاز.
            </Text>

            <View style={styles.statusBox}>
              <View style={styles.statusRow}>
                <Ionicons
                  name={state.permissionGranted ? "checkmark-circle" : "close-circle"}
                  size={18}
                  color={state.permissionGranted ? "#15803d" : "#dc2626"}
                />
                <Text style={styles.statusText}>
                  صلاحية التطبيق: {state.permissionGranted ? "مفعلة" : "غير مفعلة"}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <Ionicons
                  name={state.servicesEnabled ? "checkmark-circle" : "close-circle"}
                  size={18}
                  color={state.servicesEnabled ? "#15803d" : "#dc2626"}
                />
                <Text style={styles.statusText}>
                  خدمة الموقع في الجهاز: {state.servicesEnabled ? "مفعلة" : "غير مفعلة"}
                </Text>
              </View>
            </View>

            {permissionMissing ? (
              <Text style={styles.hint}>اسمح للتطبيق بالوصول إلى الموقع حتى يتم تشغيلك تلقائيًا والدخول إلى التطبيق.</Text>
            ) : null}
            {servicesMissing ? (
              <Text style={styles.hint}>فعّل خدمة الموقع في الجهاز ثم عد إلى التطبيق، أو استخدم الزر أدناه لإعادة التحقق.</Text>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed, loading && styles.btnDisabled]}
              onPress={() => void resolveAccess("request")}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {permissionMissing ? "منح صلاحية الموقع" : servicesMissing ? "تفعيل الموقع والمتابعة" : "متابعة"}
                </Text>
              )}
            </Pressable>

            {!permissionMissing ? (
              <Pressable
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
                onPress={() => void resolveAccess("check")}
                disabled={loading}
              >
                <Text style={styles.secondaryBtnText}>تحقق مجددًا</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
                onPress={() => void openDriverAppSettings()}
              >
                <Text style={styles.secondaryBtnText}>فتح إعدادات التطبيق</Text>
              </Pressable>
            )}
          </View>
        </View>
      </DriverScreenBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "transparent",
    direction: "rtl"
  },
  wrap: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "center"
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    padding: 22,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    ...rtlText,
    textAlign: "right"
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 24,
    color: "#64748b",
    ...rtlText,
    textAlign: "right"
  },
  statusBox: {
    marginTop: 18,
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 16,
    padding: 14,
    gap: 12
  },
  statusRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10
  },
  statusText: {
    flex: 1,
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
    ...rtlText,
    textAlign: "right"
  },
  hint: {
    marginTop: 14,
    color: "#475569",
    fontSize: 13,
    lineHeight: 22,
    ...rtlText,
    textAlign: "right"
  },
  error: {
    marginTop: 12,
    color: "#dc2626",
    fontSize: 13,
    lineHeight: 22,
    ...rtlText,
    textAlign: "right"
  },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center"
  },
  primaryBtnPressed: {
    opacity: 0.92
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    ...rtlText
  },
  secondaryBtn: {
    marginTop: 10,
    backgroundColor: "#e2e8f0",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center"
  },
  secondaryBtnPressed: {
    opacity: 0.9
  },
  secondaryBtnText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
    ...rtlText
  },
  btnDisabled: {
    opacity: 0.7
  }
});
