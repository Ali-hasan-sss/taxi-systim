import { useTheme, useThemedStyles, KeyboardAvoidingView } from "@taxi/expo-theme";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  LayoutChangeEvent,
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

const modalSheetMaxHeight = Math.round(Dimensions.get("window").height * 0.88);

type OrderFieldKey = "from" | "to" | "phone" | "amount" | "notes";

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
  const { theme } = useTheme();
  const styles = useThemedStyles((t) => ({
    rtlScreen: {
      direction: "rtl" as const,
      alignItems: "stretch" as const
    },
    modalRoot: {
      flex: 1,
      justifyContent: "flex-end" as const
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.colors.overlay
    },
    modalSheet: {
      backgroundColor: t.colors.modalBg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 20,
      paddingHorizontal: 20,
      borderWidth: 1,
      borderColor: t.colors.modalBorder
    },
    modalScrollContent: {
      alignItems: "stretch" as const
    },
    modalHeader: {
      flexDirection: "row-reverse" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      marginBottom: 8
    },
    modalTitle: {
      color: t.colors.text,
      fontSize: 20,
      fontWeight: "800" as const,
      ...rtlText
    },
    modalClose: {
      paddingVertical: 6,
      paddingHorizontal: 4
    },
    modalCloseText: {
      color: t.colors.link,
      fontWeight: "800" as const,
      fontSize: 15,
      ...rtlText
    },
    modalSubtitle: {
      color: t.colors.textMuted,
      ...rtlText,
      lineHeight: 22,
      marginBottom: 8
    },
    label: {
      color: t.colors.textMuted,
      fontSize: 13,
      fontWeight: "700" as const,
      ...rtlText,
      marginBottom: 6
    },
    /** منطقة لمس للسكرول بين الحقول — لا تضع مدخلات هنا */
    scrollGap: {
      height: 22
    },
    input: {
      backgroundColor: t.colors.inputBg,
      borderWidth: 1,
      borderColor: t.colors.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: t.colors.text,
      fontSize: 16,
      ...rtlText
    },
    inputMultiline: {
      minHeight: 88,
      paddingTop: 12
    },
    row: {
      flexDirection: "row-reverse" as const,
      gap: 10,
      marginTop: 8,
      flexWrap: "wrap" as const,
      justifyContent: "flex-end" as const
    },
    chip: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: t.colors.chipBg,
      borderWidth: 1,
      borderColor: t.colors.border
    },
    chipOn: {
      borderColor: t.colors.chipActiveBorder,
      backgroundColor: t.colors.accentSoft
    },
    chipText: {
      color: t.colors.chipText,
      fontWeight: "700" as const,
      fontSize: 14,
      ...rtlText
    },
    chipTextOn: {
      color: t.mode === "light" ? t.colors.primaryDark : t.colors.chipActiveText,
      fontWeight: "800" as const
    },
    submit: {
      marginTop: 20,
      marginBottom: 24,
      backgroundColor: t.colors.primary,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: "center" as const
    },
    submitText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 16,
      ...rtlText
    },
    disabled: {
      opacity: 0.6
    }
  }));

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
  const scrollRef = useRef<ScrollView>(null);
  const fieldTopsRef = useRef<Partial<Record<OrderFieldKey, number>>>({});
  const [androidKeyboardPad, setAndroidKeyboardPad] = useState(0);

  const scrollToField = useCallback((key: OrderFieldKey) => {
    const y = fieldTopsRef.current[key];
    if (y == null) return;
    const run = () => scrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true });
    run();
    setTimeout(run, Platform.OS === "android" ? 280 : 120);
  }, []);

  const trackFieldLayout = useCallback(
    (key: OrderFieldKey) => (event: LayoutChangeEvent) => {
      fieldTopsRef.current[key] = event.nativeEvent.layout.y;
    },
    []
  );

  const handleFieldFocus = useCallback(
    (key: OrderFieldKey) => () => {
      scrollToField(key);
    },
    [scrollToField]
  );

  const focusField = useCallback(
    (ref: RefObject<TextInputRef | null>, key: OrderFieldKey) => {
      ref.current?.focus();
      scrollToField(key);
    },
    [scrollToField]
  );

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
      setAndroidKeyboardPad(0);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    const onShow = Keyboard.addListener("keyboardDidShow", (event) => {
      setAndroidKeyboardPad(event.endCoordinates.height);
    });
    const onHide = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKeyboardPad(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
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
      void onCreated?.();
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إنشاء الطلب. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => !submitting && onClose()}>
      <KeyboardAvoidingView
        inModal
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? -20 : 0}
        style={[styles.modalRoot, styles.rtlScreen]}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !submitting && onClose()}
          accessibilityRole="button"
        />
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
            ref={scrollRef}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.modalScrollContent,
              { paddingBottom: Math.max(insets.bottom, 16) + 24 + androidKeyboardPad }
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
            <View style={styles.scrollGap} />

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
              <Pressable
                onPress={() => setVehicleRequirement("VIP")}
                style={[styles.chip, vehicleRequirement === "VIP" && styles.chipOn]}
              >
                <Text style={[styles.chipText, vehicleRequirement === "VIP" && styles.chipTextOn]}>VIP</Text>
              </Pressable>
            </View>
            <View style={styles.scrollGap} />

            <View onLayout={trackFieldLayout("from")}>
              <Text style={styles.label}>من (الانطلاق)</Text>
              <TextInput
                ref={orderFromRef}
                value={fromAddr}
                onChangeText={setFromAddr}
                placeholder="عنوان أو وصف نقطة الانطلاق"
                placeholderTextColor={theme.colors.placeholder}
                style={styles.input}
                returnKeyType="next"
                blurOnSubmit={false}
                onFocus={handleFieldFocus("from")}
                onSubmitEditing={() => focusField(orderToRef, "to")}
              />
            </View>
            <View style={styles.scrollGap} />

            <View onLayout={trackFieldLayout("to")}>
              <Text style={styles.label}>إلى (الوجهة)</Text>
              <TextInput
                ref={orderToRef}
                value={toAddr}
                onChangeText={setToAddr}
                placeholder="عنوان أو وصف الوجهة"
                placeholderTextColor={theme.colors.placeholder}
                style={styles.input}
                returnKeyType="next"
                blurOnSubmit={false}
                onFocus={handleFieldFocus("to")}
                onSubmitEditing={() => focusField(orderPhoneRef, "phone")}
              />
            </View>
            <View style={styles.scrollGap} />

            <View onLayout={trackFieldLayout("phone")}>
              <Text style={styles.label}>رقم الزبون</Text>
              <TextInput
                ref={orderPhoneRef}
                value={phone}
                onChangeText={setPhone}
                placeholder="07xxxxxxxx"
                placeholderTextColor={theme.colors.placeholder}
                style={styles.input}
                keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "phone-pad"}
                returnKeyType="next"
                blurOnSubmit={false}
                onFocus={handleFieldFocus("phone")}
                onSubmitEditing={() => focusField(orderAmountRef, "amount")}
              />
            </View>
            <View style={styles.scrollGap} />

            <View onLayout={trackFieldLayout("amount")}>
              <Text style={styles.label}>تكلفة الطلب</Text>
              <TextInput
                ref={orderAmountRef}
                value={amountText}
                onChangeText={setAmountText}
                placeholder="مثال: 25 أو 25.5"
                placeholderTextColor={theme.colors.placeholder}
                style={styles.input}
                keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "decimal-pad"}
                returnKeyType="next"
                blurOnSubmit={false}
                onFocus={handleFieldFocus("amount")}
                onSubmitEditing={() => focusField(orderNotesRef, "notes")}
              />
            </View>
            <View style={styles.scrollGap} />

            <View onLayout={trackFieldLayout("notes")} collapsable={false}>
              <Text style={styles.label}>ملاحظات إضافية (اختياري)</Text>
              <TextInput
                ref={orderNotesRef}
                value={orderNotes}
                onChangeText={setOrderNotes}
                placeholder="تعليمات للسائق، لون مميز، نقطة لقاء..."
                placeholderTextColor={theme.colors.placeholder}
                style={[styles.input, styles.inputMultiline]}
                multiline
                scrollEnabled={false}
                textAlignVertical="top"
                onFocus={handleFieldFocus("notes")}
              />
            </View>
            <View style={styles.scrollGap} />

            <Pressable
              onPress={() => void submitOrder()}
              disabled={submitting}
              style={[styles.submit, submitting && styles.disabled]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.submitText}>إنشاء الطلب وبثّه</Text>
              )}
            </Pressable>
            </ScrollView>
          </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
