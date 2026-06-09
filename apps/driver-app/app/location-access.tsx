import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, ActivityIndicator, Pressable, Text, View } from "react-native";
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
  const { theme } = useTheme();
  const setOnline = useDriverStore((s) => s.setOnline);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<DriverLocationAccessState>(initialState);
  const [error, setError] = useState<string | null>(null);

  const styles = useThemedStyles((t) => ({
    safe: {
      flex: 1,
      backgroundColor: "transparent",
      direction: "rtl" as const
    },
    wrap: {
      flex: 1,
      paddingHorizontal: 20,
      justifyContent: "center" as const
    },
    card: {
      backgroundColor: t.colors.surfaceGlass,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: 22,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.08,
      shadowRadius: 20,
      elevation: 6
    },
    iconWrap: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: t.colors.infoBg,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      alignSelf: "center" as const,
      marginBottom: 14
    },
    title: {
      fontSize: 24,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    subtitle: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 24,
      color: t.colors.textMuted,
      ...rtlText,
      textAlign: "right" as const
    },
    statusBox: {
      marginTop: 18,
      backgroundColor: t.colors.surfaceInset,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 16,
      padding: 14,
      gap: 12
    },
    statusRow: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      gap: 10
    },
    statusText: {
      flex: 1,
      color: t.colors.textSecondary,
      fontSize: 14,
      fontWeight: "700" as const,
      ...rtlText,
      textAlign: "right" as const
    },
    hint: {
      marginTop: 14,
      color: t.colors.textSubtle,
      fontSize: 13,
      lineHeight: 22,
      ...rtlText,
      textAlign: "right" as const
    },
    error: {
      marginTop: 12,
      color: t.colors.danger,
      fontSize: 13,
      lineHeight: 22,
      ...rtlText,
      textAlign: "right" as const
    },
    primaryBtn: {
      marginTop: 18,
      backgroundColor: t.colors.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: "center" as const
    },
    primaryBtnPressed: {
      opacity: 0.92
    },
    primaryBtnText: {
      color: t.colors.textInverse,
      fontSize: 15,
      fontWeight: "800" as const,
      ...rtlText
    },
    secondaryBtn: {
      marginTop: 10,
      backgroundColor: t.colors.buttonSecondaryBg,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center" as const
    },
    secondaryBtnPressed: {
      opacity: 0.9
    },
    secondaryBtnText: {
      color: t.colors.buttonSecondaryText,
      fontSize: 14,
      fontWeight: "800" as const,
      ...rtlText
    },
    btnDisabled: {
      opacity: 0.7
    }
  }));

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
              <Ionicons name="location-outline" size={34} color={theme.colors.primary} />
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
                  color={state.permissionGranted ? theme.colors.success : theme.colors.danger}
                />
                <Text style={styles.statusText}>
                  صلاحية التطبيق: {state.permissionGranted ? "مفعلة" : "غير مفعلة"}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <Ionicons
                  name={state.servicesEnabled ? "checkmark-circle" : "close-circle"}
                  size={18}
                  color={state.servicesEnabled ? theme.colors.success : theme.colors.danger}
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
                <ActivityIndicator color={theme.colors.textInverse} />
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
