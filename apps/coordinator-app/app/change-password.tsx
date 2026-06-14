import { KeyboardAvoidingView, useTheme, useThemedStyles } from "@taxi/expo-theme";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coordinatorChangePassword } from "../src/lib/api";
import { shouldLoadExpoPushModule } from "../src/lib/push-environment";
import { feedback } from "../src/lib/feedback";
import { clearSession, getSession } from "../src/lib/session";
import { rtlText } from "../src/lib/rtl-text";

export default function ChangePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const styles = useThemedStyles((t) => ({
    root: { flex: 1, backgroundColor: t.colors.background, direction: "rtl" as const },
    header: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border
    },
    headerTitle: { fontSize: 18, fontWeight: "800" as const, color: t.colors.text, ...rtlText, flex: 1 },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 32 },
    hint: { fontSize: 14, color: t.colors.textMuted, lineHeight: 22, marginBottom: 20, ...rtlText },
    label: { fontSize: 13, color: t.colors.textSecondary, marginBottom: 6, ...rtlText },
    inputRow: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: t.colors.inputBorder,
      borderRadius: 12,
      backgroundColor: t.colors.inputBg,
      marginBottom: 16
    },
    input: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: t.colors.text,
      fontSize: 16,
      ...rtlText
    },
    eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
    submit: {
      marginTop: 8,
      backgroundColor: t.colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: "center" as const
    },
    submitText: { color: t.colors.textInverse, fontWeight: "800" as const, fontSize: 16, ...rtlText },
    disabled: { opacity: 0.6 }
  }));

  const submit = async () => {
    if (!currentPassword.trim()) {
      feedback.error("أدخل كلمة المرور الحالية.");
      return;
    }
    if (newPassword.length < 6) {
      feedback.error("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.");
      return;
    }
    if (newPassword !== confirmPassword) {
      feedback.error("تأكيد كلمة المرور غير مطابق.");
      return;
    }
    if (newPassword === currentPassword) {
      feedback.error("كلمة المرور الجديدة يجب أن تختلف عن الحالية.");
      return;
    }

    const session = await getSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }

    setSaving(true);
    try {
      await coordinatorChangePassword(session.accessToken, { currentPassword, newPassword });
      if (shouldLoadExpoPushModule()) {
        const { unregisterCoordinatorPushOnServer } = await import("../src/lib/expo-push");
        await unregisterCoordinatorPushOnServer();
      }
      await clearSession();
      feedback.success("تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.", "تم التحديث");
      router.replace("/login");
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "فشل تغيير كلمة المرور");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="رجوع">
          <Ionicons name="arrow-forward" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>تغيير كلمة المرور</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.hint}>
          بعد الحفظ تُنهى جلستك الحالية وتحتاج لتسجيل الدخول مجددًا بكلمة المرور الجديدة.
        </Text>

        <Text style={styles.label}>كلمة المرور الحالية</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry={!showCurrent}
            placeholder="أدخل كلمة المرور الحالية"
            placeholderTextColor={theme.colors.placeholder}
            style={styles.input}
            autoComplete="current-password"
          />
          <Pressable style={styles.eyeBtn} onPress={() => setShowCurrent((v) => !v)}>
            <Ionicons name={showCurrent ? "eye-off-outline" : "eye-outline"} size={22} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        <Text style={styles.label}>كلمة المرور الجديدة</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showNew}
            placeholder="6 أحرف على الأقل"
            placeholderTextColor={theme.colors.placeholder}
            style={styles.input}
            autoComplete="new-password"
          />
          <Pressable style={styles.eyeBtn} onPress={() => setShowNew((v) => !v)}>
            <Ionicons name={showNew ? "eye-off-outline" : "eye-outline"} size={22} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        <Text style={styles.label}>تأكيد كلمة المرور الجديدة</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showNew}
            placeholder="أعد إدخال كلمة المرور الجديدة"
            placeholderTextColor={theme.colors.placeholder}
            style={styles.input}
            autoComplete="new-password"
          />
        </View>

        <Pressable style={[styles.submit, saving && styles.disabled]} onPress={() => void submit()} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.submitText}>حفظ كلمة المرور</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
