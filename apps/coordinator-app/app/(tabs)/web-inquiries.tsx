import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type WebInquiryRow,
  dismissWebInquiry,
  listWebInquiries,
  publishWebInquiry
} from "../../src/lib/api";
import { feedback } from "../../src/lib/feedback";
import { rtlText } from "../../src/lib/rtl-text";
import { clearSession, getSession } from "../../src/lib/session";
import { coordinatorTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { useCoordinatorStore } from "../../src/store";
import { openWhatsAppBusinessOnlyWithText, WHATSAPP_BUSINESS_REQUIRED_MESSAGE } from "../../src/lib/whatsapp";

export default function WebInquiriesTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const setWebInquiryCount = useCoordinatorStore((s) => s.setWebInquiryCount);
  const [rows, setRows] = useState<WebInquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<WebInquiryRow | null>(null);
  const [amount, setAmount] = useState("");

  const styles = useThemedStyles((t) => ({
    root: { flex: 1, backgroundColor: t.colors.background, direction: "rtl" as const },
    centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
    title: { fontSize: 22, fontWeight: "800" as const, color: t.colors.text, ...rtlText, marginBottom: 8 },
    hint: { fontSize: 14, color: t.colors.textMuted, ...rtlText, marginBottom: 16, lineHeight: 22 },
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: t.colors.border
    },
    cardTitle: { fontSize: 18, fontWeight: "800" as const, color: t.colors.text, ...rtlText },
    phoneRow: { flexDirection: "row-reverse" as const, alignItems: "center", gap: 8, marginTop: 8 },
    phoneText: { fontSize: 15, fontWeight: "700" as const, color: t.colors.text, ...rtlText, flex: 1 },
    route: { marginTop: 12, gap: 8 },
    routeLine: { fontSize: 14, color: t.colors.textSecondary, ...rtlText, lineHeight: 22 },
    notes: { marginTop: 10, fontSize: 13, color: t.colors.textMuted, ...rtlText, lineHeight: 20 },
    actions: { flexDirection: "row-reverse" as const, flexWrap: "wrap", gap: 8, marginTop: 14 },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: t.colors.border
    },
    primaryBtn: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: t.colors.primary
    },
    primaryBtnText: { color: t.colors.textInverse, fontWeight: "800" as const, fontSize: 13, ...rtlText },
    dangerBtn: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: t.colors.dangerSoft
    },
    dangerBtnText: { color: t.colors.danger, fontWeight: "800" as const, fontSize: 13, ...rtlText },
    empty: { textAlign: "center", color: t.colors.textMuted, ...rtlText, marginTop: 40, fontSize: 15 },
    modalBackdrop: { flex: 1, backgroundColor: t.colors.overlay, justifyContent: "center", padding: 20 },
    modalCard: {
      backgroundColor: t.colors.surface,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: t.colors.border
    },
    modalTitle: { fontSize: 18, fontWeight: "800" as const, color: t.colors.text, ...rtlText, marginBottom: 12 },
    input: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 16,
      color: t.colors.text,
      backgroundColor: t.colors.surfaceMuted,
      marginBottom: 12
    },
    modalActions: { flexDirection: "row-reverse" as const, gap: 10, marginTop: 4 }
  }));

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const session = await getSession();
      if (!session?.accessToken) {
        router.replace("/login");
        return;
      }
      const data = await listWebInquiries(session.accessToken);
      setRows(data);
      setWebInquiryCount(data.length);
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر تحميل طلبات الويب");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router, setWebInquiryCount]);

  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load])
  );

  const callCustomer = (phone: string | null) => {
    if (!phone?.trim()) {
      feedback.warning("لا يوجد رقم هاتف.");
      return;
    }
    void Linking.openURL(`tel:${phone.trim()}`);
  };

  const openWhatsApp = async (row: WebInquiryRow) => {
    if (!row.customerPhone?.trim()) {
      feedback.warning("لا يوجد رقم هاتف.");
      return;
    }
    const message = `مرحباً، أنا من Taxi Bro بخصوص طلب التاكسي من ${row.pickupAddress} إلى ${row.dropoffAddress}.`;
    const opened = await openWhatsAppBusinessOnlyWithText(row.customerPhone, message);
    if (!opened) feedback.warning(WHATSAPP_BUSINESS_REQUIRED_MESSAGE);
  };

  const onDismiss = async (row: WebInquiryRow) => {
    const session = await getSession();
    if (!session?.accessToken) return;
    setBusyId(row.id);
    try {
      await dismissWebInquiry(session.accessToken, row.id);
      feedback.success("تم رفض الطلب.");
      await load("refresh");
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر رفض الطلب");
    } finally {
      setBusyId(null);
    }
  };

  const onPublish = async () => {
    if (!publishTarget) return;
    const parsed = Number(amount.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      feedback.warning("أدخل أجرة صالحة.");
      return;
    }
    const session = await getSession();
    if (!session?.accessToken) return;
    setBusyId(publishTarget.id);
    try {
      await publishWebInquiry(session.accessToken, publishTarget.id, { amount: parsed, broadcastTarget: "ALL" });
      feedback.success("تم إرسال الطلب إلى غرفة السائقين.");
      setPublishTarget(null);
      setAmount("");
      await load("refresh");
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر الإرسال");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: coordinatorTabBarOuterHeight(insets.bottom) + 16
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>طلبات الويب</Text>
            <Text style={styles.hint}>طلبات الزبائن من صفحة Taxi Bro — اتصل أو راسل الزبون ثم أرسل الطلب الحقيقي إلى السائقين.</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>لا توجد طلبات ويب جديدة حاليًا.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.customerName}</Text>
            <View style={styles.phoneRow}>
              <Text style={styles.phoneText}>{item.customerPhone || "بدون رقم"}</Text>
              <Pressable style={styles.iconBtn} onPress={() => callCustomer(item.customerPhone)} accessibilityLabel="اتصال">
                <Ionicons name="call-outline" size={20} color={theme.colors.success} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => void openWhatsApp(item)} accessibilityLabel="واتساب بزنس">
                <Ionicons name="logo-whatsapp" size={20} color={theme.colors.whatsapp} />
              </Pressable>
            </View>
            <View style={styles.route}>
              <Text style={styles.routeLine}>من: {item.pickupAddress}</Text>
              <Text style={styles.routeLine}>إلى: {item.dropoffAddress}</Text>
            </View>
            {item.notes ? <Text style={styles.notes}>ملاحظات: {item.notes}</Text> : null}
            <View style={styles.actions}>
              <Pressable
                style={styles.primaryBtn}
                disabled={busyId === item.id}
                onPress={() => {
                  setPublishTarget(item);
                  setAmount("");
                }}
              >
                <Text style={styles.primaryBtnText}>إرسال إلى السائقين</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} disabled={busyId === item.id} onPress={() => void onDismiss(item)}>
                <Text style={styles.dangerBtnText}>رفض</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <Modal visible={publishTarget != null} transparent animationType="fade" onRequestClose={() => setPublishTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPublishTarget(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>إرسال الطلب إلى السائقين</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="الأجرة بالليرة"
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.primaryBtn} onPress={() => void onPublish()}>
                <Text style={styles.primaryBtnText}>تأكيد الإرسال</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={() => setPublishTarget(null)}>
                <Text style={styles.dangerBtnText}>إلغاء</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
