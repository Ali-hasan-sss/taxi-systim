import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { rtlText } from "./rtl-text";

export type FeedbackTone = "success" | "error" | "warning" | "info";

const ACCENT: Record<FeedbackTone, string> = {
  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#38bdf8"
};

type DialogState =
  | {
      variant: "confirm";
      title: string;
      body: string;
      cancelLabel: string;
      confirmLabel: string;
      destructive: boolean;
      onConfirm: () => void;
    }
  | {
      variant: "alert";
      tone: FeedbackTone;
      title: string;
      body: string;
    };

let setDialogGlobal: ((d: DialogState | null) => void) | null = null;

function openDialog(next: DialogState) {
  setDialogGlobal?.(next);
}

function closeDialog() {
  setDialogGlobal?.(null);
}

/**
 * نوافذ موحّدة (تأكيد / تنبيه مع «موافق») — يجب تضمين `<FeedbackHost />` في الجذر.
 */
export function FeedbackHost() {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const { width } = useWindowDimensions();
  const cardMaxWidth = Math.min(400, width - 48);

  useEffect(() => {
    setDialogGlobal = setDialog;
    return () => {
      setDialogGlobal = null;
    };
  }, []);

  const onBackdropPress = useCallback(() => {
    closeDialog();
  }, []);

  const handleConfirm = useCallback(() => {
    if (dialog?.variant !== "confirm") return;
    const fn = dialog.onConfirm;
    closeDialog();
    fn();
  }, [dialog]);

  const handleAlertOk = useCallback(() => {
    closeDialog();
  }, []);

  if (!dialog) return null;

  const accent =
    dialog.variant === "alert" ? ACCENT[dialog.tone] : "#f87171";

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeDialog}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onBackdropPress}
        accessibilityLabel="إغلاق"
      >
        <Pressable
          style={[styles.card, { maxWidth: cardMaxWidth, borderLeftColor: accent }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={styles.title}>{dialog.title}</Text>
          <Text style={styles.body}>{dialog.body}</Text>

          {dialog.variant === "confirm" ? (
            <View style={styles.actionsRow}>
              <Pressable
                onPress={closeDialog}
                style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.btnSecondaryText}>{dialog.cancelLabel}</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                style={({ pressed }) => [
                  dialog.destructive ? styles.btnDanger : styles.btnPrimary,
                  pressed && styles.pressed
                ]}
                accessibilityRole="button"
              >
                <Text style={dialog.destructive ? styles.btnDangerText : styles.btnPrimaryText}>
                  {dialog.confirmLabel}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handleAlertOk}
              style={({ pressed }) => [styles.btnPrimaryFull, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>موافق</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const feedback = {
  success(message: string, title = "تم") {
    openDialog({ variant: "alert", tone: "success", title, body: message });
  },
  error(message: string, title = "خطأ") {
    openDialog({ variant: "alert", tone: "error", title, body: message });
  },
  warning(message: string, title = "تنبيه") {
    openDialog({ variant: "alert", tone: "warning", title, body: message });
  },
  info(message: string, title: string) {
    openDialog({ variant: "alert", tone: "info", title, body: message });
  },

  /** نفس شكل نافذة التأكيد — عنوان ونص وأزرار رجوع / إلغاء */
  confirmCancelOrder(onConfirm: () => void) {
    openDialog({
      variant: "confirm",
      title: "تأكيد إلغاء الطلب",
      body:
        "سيتم إلغاء الطلب وإبلاغ السائقين المعنيّين. هذا الإجراء نهائي ضمن التطبيق.\n\nهل تريد المتابعة؟",
      cancelLabel: "رجوع",
      confirmLabel: "إلغاء الطلب",
      destructive: true,
      onConfirm
    });
  }
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24
  },
  card: {
    width: "100%",
    backgroundColor: "#1e293b",
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "#334155",
    borderLeftWidth: 4,
    direction: "rtl",
    alignItems: "stretch",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText,
    marginBottom: 12,
    lineHeight: 26
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: "#cbd5e1",
    ...rtlText,
    marginBottom: 22
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-start",
    marginTop: 4
  },
  btnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#334155",
    minWidth: 108,
    alignItems: "flex-start"
  },
  btnSecondaryText: {
    color: "#e2e8f0",
    fontWeight: "800",
    fontSize: 15,
    ...rtlText
  },
  btnDanger: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#7f1d1d",
    minWidth: 128,
    alignItems: "flex-start"
  },
  btnDangerText: {
    color: "#fecaca",
    fontWeight: "800",
    fontSize: 15,
    ...rtlText
  },
  btnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    minWidth: 108,
    alignItems: "flex-start"
  },
  btnPrimaryFull: {
    marginTop: 4,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    alignItems: "flex-start"
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    ...rtlText
  },
  pressed: {
    opacity: 0.88
  }
});
