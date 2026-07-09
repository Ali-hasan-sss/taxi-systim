import { useTheme, useThemedStyles, KeyboardAvoidingView } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverScreenBackground } from "../src/components/DriverScreenBackground";
import { driverLogin } from "../src/lib/api";
import { ensurePushRegistrationForDriver, isPushRegistrationFailure } from "../src/lib/expo-push";
import { feedback } from "../src/lib/feedback";
import { getDriverLocationAccessState, isDriverLocationReady } from "../src/lib/location-access";
import { rtlText } from "../src/lib/rtl-text";
import { saveDriverSession } from "../src/lib/session";
import { useDriverStore } from "../src/store";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const setOnline = useDriverStore((s) => s.setOnline);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const styles = useThemedStyles((t) => ({
    safe: {
      flex: 1,
      backgroundColor: "transparent",
      direction: "rtl" as const
    },
    kav: {
      flex: 1,
      paddingHorizontal: 24,
      paddingBottom: 16
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "flex-start" as const,
      alignItems: "stretch" as const
    },
    card: {
      backgroundColor: t.colors.surfaceGlass,
      borderRadius: 22,
      padding: 24,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: "stretch" as const,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 6
    },
    badge: {
      alignSelf: "flex-end" as const,
      backgroundColor: t.colors.success,
      color: t.colors.textInverse,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      fontSize: 12,
      fontWeight: "700" as const,
      overflow: "hidden" as const,
      marginBottom: 12,
      textAlign: "right" as const
    },
    title: {
      fontSize: 26,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    subtitle: {
      fontSize: 14,
      color: t.colors.textMuted,
      marginTop: 6,
      marginBottom: 24,
      ...rtlText,
      lineHeight: 22,
      textAlign: "right" as const
    },
    label: {
      fontSize: 13,
      color: t.colors.textSubtle,
      marginBottom: 6,
      ...rtlText,
      textAlign: "right" as const
    },
    input: {
      borderWidth: 1,
      borderColor: t.colors.inputBorder,
      backgroundColor: t.colors.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: t.colors.text,
      marginBottom: 14,
      ...rtlText,
      textAlign: "right" as const
    },
    passwordRow: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: t.colors.inputBorder,
      backgroundColor: t.colors.inputBg,
      borderRadius: 12,
      marginBottom: 14,
      paddingHorizontal: 8,
      direction: "rtl" as const
    },
    inputPassword: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    eyeBtn: {
      padding: 10
    },
    error: {
      color: t.colors.danger,
      marginBottom: 12,
      ...rtlText,
      lineHeight: 22,
      fontSize: 14,
      textAlign: "right" as const
    },
    button: {
      backgroundColor: t.colors.primary,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: "center" as const,
      marginTop: 8
    },
    buttonPressed: {
      opacity: 0.9
    },
    buttonText: {
      color: t.colors.textInverse,
      fontSize: 17,
      fontWeight: "700" as const,
      ...rtlText
    }
  }));

  const onLogin = async () => {
    setError(null);
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError("أدخل رقم الهاتف.");
      return;
    }
    const digits = trimmedPhone.replace(/\D/g, "");
    if (digits.length < 8) {
      setError("رقم الهاتف قصير جدًا (8 أرقام على الأقل).");
      return;
    }
    if (!password) {
      setError("أدخل كلمة المرور.");
      return;
    }
    setLoading(true);
    try {
      const session = await driverLogin(trimmedPhone, password);
      await saveDriverSession(JSON.stringify(session));
      // لا نُبطّئ تسجيل الدخول بانتظار FCM — قد تكون إعادة المحاولة بطيئة.
      void ensurePushRegistrationForDriver(session.accessToken)
        .then((pushResult) => {
          if (isPushRegistrationFailure(pushResult)) {
            feedback.warning(
              pushResult.message ??
                `تعذر تسجيل إشعارات الجهاز (${pushResult.reason}). راجع docs/PUSH-SETUP-AR.md — غالباً ينقص google-services.json`,
              "إشعارات الجوال"
            );
          }
        })
        .catch(() => undefined);
      const locationState = await getDriverLocationAccessState();
      if (isDriverLocationReady(locationState)) {
        setOnline(true);
        router.replace("/(tabs)");
      } else {
        setOnline(false);
        router.replace("/location-access");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  };

  const scrollBottomPad = Math.max(insets.bottom, 12) + 72;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <DriverScreenBackground variant="auth">
        <KeyboardAvoidingView behavior="padding" style={styles.kav}>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingTop: 12, paddingBottom: scrollBottomPad }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <Text style={styles.badge}>سائق</Text>
              <Text style={styles.title}>تسجيل الدخول</Text>
              <Text style={styles.subtitle}>تطبيق سائقي شركة التكسي — الدخول برقم الهاتف وكلمة المرور.</Text>

              <Text style={styles.label}>رقم الهاتف</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="مثال: 07xxxxxxxx"
                placeholderTextColor={theme.colors.placeholder}
                style={styles.input}
                returnKeyType="next"
              />

              <Text style={styles.label}>كلمة المرور</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  placeholderTextColor={theme.colors.placeholder}
                  style={styles.inputPassword}
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => void onLogin()}
                />
                <Pressable
                  onPress={() => setShowPassword((v: boolean) => !v)}
                  style={styles.eyeBtn}
                  accessibilityLabel={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={22}
                    color={theme.colors.placeholder}
                  />
                </Pressable>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                onPress={() => void onLogin()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.buttonText}>دخول</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </DriverScreenBackground>
    </SafeAreaView>
  );
}
