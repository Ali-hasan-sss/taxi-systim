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
import { driverLogin } from "../src/lib/api";
import { saveDriverSession } from "../src/lib/session";
import { rtlText } from "../src/lib/rtl-text";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  };

  const scrollBottomPad = Math.max(insets.bottom, 12) + 72;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kav}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: 12, paddingBottom: scrollBottomPad }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc",
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
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "stretch",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#15803d",
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    marginBottom: 12
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
    ...rtlText
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 6,
    marginBottom: 24,
    ...rtlText,
    lineHeight: 22
  },
  label: {
    fontSize: 13,
    color: "#475569",
    marginBottom: 6,
    ...rtlText
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
    ...rtlText
  },
  passwordRow: {
    flexDirection: "row",
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
    ...rtlText
  },
  eyeBtn: {
    padding: 10
  },
  error: {
    color: "#f87171",
    marginBottom: 12,
    ...rtlText,
    lineHeight: 22,
    fontSize: 14
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
