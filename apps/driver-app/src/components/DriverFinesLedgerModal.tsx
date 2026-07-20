import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { fetchDriverFines, type DriverFineRow, type DriverFinesLedger } from "../lib/api";
import { rtlText } from "../lib/rtl-text";
import { getDriverSession } from "../lib/session";

function formatMoney(value: string | number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("ar-SY", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Damascus"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  onAuthFailure?: () => void;
};

export function DriverFinesLedgerModal({ open, onClose, onAuthFailure }: Props) {
  const { theme } = useTheme();
  const { height } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<DriverFinesLedger | null>(null);

  const styles = useThemedStyles((t) => ({
    backdrop: {
      flex: 1,
      backgroundColor: t.colors.overlayLight,
      justifyContent: "center" as const,
      paddingHorizontal: 18
    },
    card: {
      maxHeight: Math.min(height * 0.78, 640),
      backgroundColor: t.colors.modalBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: t.colors.modalBorder,
      paddingTop: 18,
      paddingBottom: 14,
      paddingHorizontal: 16,
      direction: "rtl" as const
    },
    header: {
      marginBottom: 12,
      gap: 4
    },
    title: {
      fontSize: 18,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    subtitle: {
      fontSize: 13,
      color: t.colors.textMuted,
      ...rtlText,
      textAlign: "right" as const
    },
    summaryRow: {
      flexDirection: "row-reverse" as const,
      justifyContent: "space-between" as const,
      gap: 10,
      marginBottom: 12
    },
    summaryBox: {
      flex: 1,
      backgroundColor: t.colors.surfaceCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: 12,
      alignItems: "flex-end" as const
    },
    summaryLabel: {
      fontSize: 12,
      color: t.colors.textMuted,
      ...rtlText
    },
    summaryValue: {
      marginTop: 4,
      fontSize: 18,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText
    },
    row: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
      gap: 4,
      alignItems: "flex-end" as const
    },
    rowAmount: {
      fontSize: 16,
      fontWeight: "800" as const,
      color: t.colors.danger,
      ...rtlText
    },
    rowReason: {
      fontSize: 14,
      fontWeight: "700" as const,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    rowMeta: {
      fontSize: 12,
      color: t.colors.textMuted,
      ...rtlText,
      textAlign: "right" as const
    },
    empty: {
      textAlign: "center" as const,
      color: t.colors.textMuted,
      ...rtlText,
      paddingVertical: 28
    },
    error: {
      color: t.colors.danger,
      ...rtlText,
      textAlign: "right" as const,
      marginBottom: 10
    },
    loader: {
      marginVertical: 28
    },
    closeBtn: {
      marginTop: 12,
      backgroundColor: t.colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center" as const
    },
    closeBtnText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 15,
      ...rtlText
    }
  }));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLedger(null);
    void (async () => {
      try {
        const session = await getDriverSession();
        if (!session) {
          onAuthFailure?.();
          return;
        }
        const data = await fetchDriverFines(session.accessToken);
        if (!cancelled) setLedger(data);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "تعذر تحميل سجل الغرامات";
        if (/Unauthorized|غير مصرح|Forbidden|401|403|تجديد الجلسة|انتهت صلاحية الجلسة|Invalid refresh/i.test(msg)) {
          onAuthFailure?.();
          return;
        }
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onAuthFailure, open]);

  const renderRow = ({ item }: { item: DriverFineRow }) => (
    <View style={styles.row}>
      <Text style={styles.rowAmount}>{formatMoney(item.amount)}</Text>
      <Text style={styles.rowReason}>{item.reason}</Text>
      <Text style={styles.rowMeta}>{formatDateTime(item.createdAt)}</Text>
      {item.createdByName ? <Text style={styles.rowMeta}>بواسطة: {item.createdByName}</Text> : null}
    </View>
  );

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>سجل الغرامات</Text>
            <Text style={styles.subtitle}>جميع الغرامات المسجّلة على حسابك</Text>
          </View>

          {loading ? (
            <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : ledger ? (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryLabel}>عدد الغرامات</Text>
                  <Text style={styles.summaryValue}>{ledger.count}</Text>
                </View>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryLabel}>المجموع</Text>
                  <Text style={styles.summaryValue}>{formatMoney(ledger.totalAmount)}</Text>
                </View>
              </View>
              <FlatList
                data={ledger.rows}
                keyExtractor={(item) => item.id}
                renderItem={renderRow}
                ListEmptyComponent={<Text style={styles.empty}>لا توجد غرامات مسجّلة.</Text>}
                showsVerticalScrollIndicator={false}
              />
            </>
          ) : null}

          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeBtnText}>إغلاق</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
