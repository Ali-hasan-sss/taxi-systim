import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInput as TextInputRef,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  coordinatorCreateOrder,
  type OrderVehicleRequirement
} from "../lib/api";
import { feedback } from "../lib/feedback";
import { getSession } from "../lib/session";
import { rtlText } from "../lib/rtl-text";

const modalSheetMaxHeight = Math.round(Dimensions.get("window").height * 0.92);

function resetOrderForm(setters: {
  setFromAddr: (v: string) => void;
  setToAddr: (v: string) => void;
  setPhone: (v: string) => void;
  setAmountText: (v: string) => void;
  setOrderNotes: (v: string) => void;
  setVehicleRequirement: (v: OrderVehicleRequirement) => void;
}) {
  setters.setFromAddr("");
  setters.setToAddr("");
  setters.setPhone("");
  setters.setAmountText("");
  setters.setOrderNotes("");
  setters.setVehicleRequirement("ANY");
}

function focusNext(ref?: RefObject<TextInputRef | null>) {
  ref?.current?.focus();
}

export function CoordinatorCreateOrderModal({
  visible,
  onClose,
  onCreated
}: {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => Promise<void> | void;
}) {
  const insets = useSafeAreaInsets();
  const [fromAddr, setFromAddr] = useState("");
  const [toAddr, setToAddr] = useState("");
  const [phone, setPhone] = useState("");
  const [amountText, setAmountText] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [vehicleRequirement, setVehicleRequirement] = useState<OrderVehicleRequirement>("ANY");
  const [submitting, setSubmitting] = useState(false);

  const orderFromRef = useRef<TextInputRef>(null);
  const orderToRef = useRef<TextInputRef>(null);
  const orderPhoneRef = useRef<TextInputRef>(null);
  const orderAmountRef = useRef<TextInputRef>(null);
  const orderNotesRef = useRef<TextInputRef>(null);

  useEffect(() => {
    if (!visible) {
      resetOrderForm({
        setFromAddr,
        setToAddr,
        setPhone,
        setAmountText,
        setOrderNotes,
        setVehicleRequirement
      });
      setSubmitting(false);
    }
  }, [visible]);

  const submitOrder = async () => {
    const session = await getSession();
    if (!session?.accessToken) {
      feedback.error("انتهت الجلسة. أعد تسجيل الدخول.");
      return;
    }

    const amount = Number(amountText.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      feedback.warning("أدخل تكلفة الطلب رقمًا صالحًا أكبر من صفر.");
      return;
    }
    if (!fromAddr.trim() || !toAddr.trim()) {
      feedback.warning("أدخل عنوان الانطلاق وعنوان الوجهة.");
      return;
    }
    if (phone.trim().length < 3) {
      feedback.warning("أدخل رقم زبون صالحًا (3 أرقام على الأقل).");
      return;
    }

    setSubmitting(true);
    try {
      const created = await coordinatorCreateOrder(session.accessToken, {
        pickupAddress: fromAddr.trim(),
        dropoffAddress: toAddr.trim(),
        customerPhone: phone.trim(),
        amount,
        broadcastTarget: "ALL",
        vehicleRequirement,
        notes: orderNotes.trim() || undefined
      });
      feedback.success(
        `تم بث الطلب إلى السائقين.\nالمعرّف: ${created.id.slice(0, 8)}...`,
        "تم إنشاء الطلب"
      );
      onClose();
      await onCreated?.();
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إنشاء الطلب. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => !submitting && onClose()}>
      <View style={[styles.modalRoot, styles.rtlScreen]}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !submitting && onClose()}
          accessibilityRole="button"
        />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View
            style={[
              styles.modalSheet,
              styles.rtlScreen,
              {
                height: modalSheetMaxHeight,
                maxHeight: modalSheetMaxHeight,
                paddingBottom: Math.max(insets.bottom, 16)
              }
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              showsVerticalScrollIndicator
              contentContainerStyle={[
                styles.modalScrollContent,
                { paddingBottom: Math.max(insets.bottom, 16) + 120 }
              ]}
            >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>طلب جديد</Text>
              <Pressable onPress={() => !submitting && onClose()} hitSlop={12} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>إغلاق</Text>
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              يُبث الطلب فور الحفظ إلى جميع السائقين المؤهلين حسب نوع السيارة أدناه.
            </Text>

            <Text style={styles.label}>نوع السيارة المطلوب</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() => setVehicleRequirement("ANY")}
                style={[styles.chip, vehicleRequirement === "ANY" && styles.chipOn]}
              >
                <Text style={[styles.chipText, vehicleRequirement === "ANY" && styles.chipTextOn]}>غير مهم</Text>
              </Pressable>
              <Pressable
                onPress={() => setVehicleRequirement("PUBLIC")}
                style={[styles.chip, vehicleRequirement === "PUBLIC" && styles.chipOn]}
              >
                <Text style={[styles.chipText, vehicleRequirement === "PUBLIC" && styles.chipTextOn]}>عامة</Text>
              </Pressable>
              <Pressable
                onPress={() => setVehicleRequirement("PRIVATE")}
                style={[styles.chip, vehicleRequirement === "PRIVATE" && styles.chipOn]}
              >
                <Text style={[styles.chipText, vehicleRequirement === "PRIVATE" && styles.chipTextOn]}>خاصة</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>من (الانطلاق)</Text>
            <TextInput
              ref={orderFromRef}
              value={fromAddr}
              onChangeText={setFromAddr}
              placeholder="عنوان أو وصف نقطة الانطلاق"
              placeholderTextColor="#64748b"
              style={styles.input}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => focusNext(orderToRef)}
            />

            <Text style={styles.label}>إلى (الوجهة)</Text>
            <TextInput
              ref={orderToRef}
              value={toAddr}
              onChangeText={setToAddr}
              placeholder="عنوان أو وصف الوجهة"
              placeholderTextColor="#64748b"
              style={styles.input}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => focusNext(orderPhoneRef)}
            />

            <Text style={styles.label}>رقم الزبون</Text>
            <TextInput
              ref={orderPhoneRef}
              value={phone}
              onChangeText={setPhone}
              placeholder="07xxxxxxxx"
              placeholderTextColor="#64748b"
              style={styles.input}
              keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "phone-pad"}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => focusNext(orderAmountRef)}
            />

            <Text style={styles.label}>تكلفة الطلب</Text>
            <TextInput
              ref={orderAmountRef}
              value={amountText}
              onChangeText={setAmountText}
              placeholder="مثال: 25 أو 25.5"
              placeholderTextColor="#64748b"
              style={styles.input}
              keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "decimal-pad"}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => focusNext(orderNotesRef)}
            />

            <Text style={styles.label}>ملاحظات إضافية (اختياري)</Text>
            <TextInput
              ref={orderNotesRef}
              value={orderNotes}
              onChangeText={setOrderNotes}
              placeholder="تعليمات للسائق، لون مميز، نقطة لقاء..."
              placeholderTextColor="#64748b"
              style={[styles.input, styles.inputMultiline]}
              multiline
              textAlignVertical="top"
            />

            <Pressable
              onPress={() => void submitOrder()}
              disabled={submitting}
              style={[styles.submit, submitting && styles.disabled]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>إنشاء الطلب وبثّه</Text>
              )}
            </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rtlScreen: {
    direction: "rtl",
    alignItems: "stretch"
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  modalSheet: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 20,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "#334155"
  },
  modalScrollContent: {
    alignItems: "stretch"
  },
  modalHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  modalTitle: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "800",
    ...rtlText
  },
  modalClose: {
    paddingVertical: 6,
    paddingHorizontal: 4
  },
  modalCloseText: {
    color: "#38bdf8",
    fontWeight: "800",
    fontSize: 15,
    ...rtlText
  },
  modalSubtitle: {
    color: "#94a3b8",
    ...rtlText,
    lineHeight: 22,
    marginBottom: 8
  },
  label: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "700",
    ...rtlText,
    marginBottom: 6,
    marginTop: 10
  },
  input: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f8fafc",
    fontSize: 16,
    ...rtlText
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: 12
  },
  row: {
    flexDirection: "row-reverse",
    gap: 10,
    marginTop: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155"
  },
  chipOn: {
    borderColor: "#38bdf8",
    backgroundColor: "#0c4a6e33"
  },
  chipText: {
    color: "#94a3b8",
    fontWeight: "700",
    fontSize: 14,
    ...rtlText
  },
  chipTextOn: {
    color: "#38bdf8"
  },
  submit: {
    marginTop: 20,
    marginBottom: 24,
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center"
  },
  submitText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    ...rtlText
  },
  disabled: {
    opacity: 0.6
  }
});
