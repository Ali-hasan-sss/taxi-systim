import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverScreenBackground } from "../src/components/DriverScreenBackground";
import { getDriverLocationAccessState, isDriverLocationReady } from "../src/lib/location-access";
import { driverLogin } from "../src/lib/api";
import { saveDriverSession } from "../src/lib/session";
import { rtlText } from "../src/lib/rtl-text";
import { useDriverStore } from "../src/store";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const setOnline = useDriverStore((s) => s.setOnline);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kav}>
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
                placeholderTextColor="#64748b"
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
                  placeholderTextColor="#64748b"
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
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#64748b" />
                </Pressable>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                onPress={() => void onLogin()}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>دخول</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  kav: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 16
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "stretch"
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    alignItems: "stretch",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6
  },
  badge: {
    alignSelf: "flex-end",
    backgroundColor: "#15803d",
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    marginBottom: 12,
    textAlign: "right"
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
    ...rtlText,
    textAlign: "right"
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 6,
    marginBottom: 24,
    ...rtlText,
    lineHeight: 22,
    textAlign: "right"
  },
  label: {
    fontSize: 13,
    color: "#475569",
    marginBottom: 6,
    ...rtlText,
    textAlign: "right"
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0f172a",
    marginBottom: 14,
    ...rtlText,
    textAlign: "right"
  },
  passwordRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    marginBottom: 14,
    paddingHorizontal: 8,
    direction: "rtl"
  },
  inputPassword: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0f172a",
    ...rtlText,
    textAlign: "right"
  },
  eyeBtn: {
    padding: 10
  },
  error: {
    color: "#f87171",
    marginBottom: 12,
    ...rtlText,
    lineHeight: 22,
    fontSize: 14,
    textAlign: "right"
  },
  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8
  },
  buttonPressed: {
    opacity: 0.9
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    ...rtlText
  }
});
