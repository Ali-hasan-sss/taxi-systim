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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coordinatorLogin } from "../src/lib/api";
import { saveSession } from "../src/lib/session";
import { rtlText } from "../src/lib/rtl-text";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      const result = await coordinatorLogin(trimmedPhone, password);
      await saveSession(JSON.stringify(result));
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[
        styles.root,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, paddingHorizontal: 24 }
      ]}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.badge}>منسق</Text>
          <Text style={styles.title}>تسجيل الدخول</Text>
          <Text style={styles.subtitle}>تطبيق منسقي شركة التكسي — الدخول برقم الهاتف وكلمة المرور فقط.</Text>

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
              onSubmitEditing={onLogin}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eyeBtn}
              accessibilityLabel={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            >
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#94a3b8" />
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={onLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>دخول</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a",
    direction: "rtl"
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 16,
    alignItems: "stretch"
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "stretch"
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#1d4ed8",
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
    color: "#f8fafc",
    ...rtlText
  },
  subtitle: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 6,
    marginBottom: 24,
    ...rtlText,
    lineHeight: 22
  },
  label: {
    fontSize: 13,
    color: "#cbd5e1",
    marginBottom: 6,
    ...rtlText
  },
  input: {
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#f1f5f9",
    marginBottom: 14,
    ...rtlText
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#475569",
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
    color: "#f1f5f9",
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
