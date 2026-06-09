import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { rtlText } from "./rtl-text";

export type FeedbackTone = "success" | "error" | "warning" | "info";

type DialogState =
  | {
      variant: "confirm";
      title: string;
      body: string;
      cancelLabel: string;
      confirmLabel: string;
      destructive: boolean;
      tone?: FeedbackTone;
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
  const { theme } = useTheme();
  const cardMaxWidth = Math.min(400, width - 48);
  const styles = useThemedStyles((t) => ({
    backdrop: {
      flex: 1,
      backgroundColor: t.colors.overlayLight,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingHorizontal: 24
    },
    card: {
      width: "100%",
      backgroundColor: t.colors.modalBg,
      borderRadius: 16,
      paddingVertical: 22,
      paddingHorizontal: 20,
      borderWidth: 1,
      borderColor: t.colors.modalBorder,
      borderLeftWidth: 4,
      direction: "rtl" as const,
      alignItems: "stretch" as const,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 12
    },
    title: {
      fontSize: 18,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 12,
      lineHeight: 26
    },
    body: {
      fontSize: 15,
      lineHeight: 24,
      color: t.colors.textSecondary,
      ...rtlText,
      marginBottom: 22
    },
    actionsRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 10,
      justifyContent: "flex-start" as const,
      marginTop: 4
    },
    btnSecondary: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: t.colors.buttonSecondaryBg,
      minWidth: 108,
      alignItems: "flex-start" as const
    },
    btnSecondaryText: {
      color: t.colors.buttonSecondaryText,
      fontWeight: "800" as const,
      fontSize: 15,
      ...rtlText
    },
    btnDanger: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: t.colors.dangerBg,
      minWidth: 128,
      alignItems: "flex-start" as const
    },
    btnDangerText: {
      color: t.colors.dangerText,
      fontWeight: "800" as const,
      fontSize: 15,
      ...rtlText
    },
    btnPrimary: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: t.colors.primary,
      minWidth: 108,
      alignItems: "flex-start" as const
    },
    btnPrimaryFull: {
      marginTop: 4,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: 12,
      backgroundColor: t.colors.primary,
      alignItems: "flex-start" as const
    },
    btnPrimaryText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 16,
      ...rtlText
    },
    pressed: {
      opacity: 0.88
    }
  }));

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

  const toneAccent: Record<FeedbackTone, string> = {
    success: theme.colors.success,
    error: theme.colors.danger,
    warning: theme.colors.warning,
    info: theme.colors.info
  };

  const accent =
    dialog.variant === "alert"
      ? toneAccent[dialog.tone]
      : dialog.tone
        ? toneAccent[dialog.tone]
        : dialog.destructive
          ? theme.colors.danger
          : theme.colors.primary;

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
  },

  confirmArchiveChat(onConfirm: () => void) {
    openDialog({
      variant: "confirm",
      title: "أرشفة المحادثة",
      body:
        "ستختفي المحادثة من قائمتك ومن قوائم السائقين والمنسقين، وستُحفظ في أرشيف المحادثات لدى الأدمن للمراجعة فقط.\n\nلن تتمكن من إرسال رسائل جديدة فيها. هل تريد المتابعة؟",
      cancelLabel: "إلغاء",
      confirmLabel: "أرشفة",
      destructive: true,
      tone: "warning",
      onConfirm
    });
  }
};
