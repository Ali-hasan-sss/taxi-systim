import { driverOrderStatusPill, useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { DriverOrderRow } from "../lib/api";
import { rtlText } from "../lib/rtl-text";

function normalizeDialNumber(raw: string): string {
  return raw.replace(/[\s\-–—().]/g, "").trim();
}

/** أرقام عربية / فارسية شائعة في الإدخال → ASCII */
function toWesternDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

async function openCustomerDialer(phone: string): Promise<void> {
  const n = normalizeDialNumber(phone);
  if (!n) return;
  const url = `tel:${n}`;
  try {
    await Linking.openURL(url);
  } catch {
    // تجاهل إن لم يُدعَم الاتصال على الجهاز
  }
}

const STATUS_AR: Record<string, string> = {
  PENDING: "معلق",
  ACCEPTED: "مقبول (قديم)",
  ARRIVED: "وصل (قديم)",
  EN_ROUTE_TO_CUSTOMER: "في الطريق إلى الزبون",
  STARTED: "الزبون في السيارة",
  STUCK: "متعثر — لم يُعثر على الزبون",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى"
};

const BROADCAST_AR: Record<string, string> = {
  ALL: "جميع السائقين",
  NEAREST_THREE: "أقرب 3 سائقين"
};

const VEHICLE_REQ_AR: Record<string, string> = {
  ANY: "غير مهم",
  PUBLIC: "عامة",
  PRIVATE: "خاصة",
  VIP: "VIP"
};

function mapStatusForPill(status: string): string {
  switch (status) {
    case "ARRIVED":
    case "EN_ROUTE_TO_CUSTOMER":
      return "EN_ROUTE";
    case "STARTED":
      return "EN_ROUTE";
    default:
      return status;
  }
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return iso;
  }
}

function formatAmount(amount: unknown): string {
  if (amount == null) return "—";
  if (typeof amount === "string" || typeof amount === "number") return String(amount);
  if (typeof amount === "object" && amount !== null && "toString" in amount) {
    return String((amount as { toString: () => string }).toString());
  }
  return String(amount);
}

/** لا يُعرَض رقم الزبون ولا زر الاتصال للمعلّق؛ وفي الأرشيف يُخفى التواصل بالكامل. */
function showCustomerContact(status: string, variant: "default" | "archive"): boolean {
  if (variant === "archive") return false;
  return status !== "PENDING";
}

/** رقم للعرض والاتصال: الحقل أولًا، ثم الاسم (زبون 09… أو أي تسلسل أرقام كافٍ). */
function resolveCustomerPhone(row: DriverOrderRow): string | null {
  const direct = row.customerPhone?.trim();
  if (direct) return direct;
  const name = toWesternDigits(row.customerName?.trim() ?? "");
  const m = name.match(/زبون\s+([\d\s\-–—().+]+)/);
  if (m?.[1]) {
    const digits = normalizeDialNumber(m[1]);
    if (digits.length >= 8) return digits;
  }
  const collapsed = name.replace(/\D/g, "");
  if (collapsed.length >= 8 && collapsed.length <= 14) return collapsed;
  const loose = name.match(/(?:\+?963|00963)?0?9\d{8}/);
  if (loose) {
    const digits = normalizeDialNumber(loose[0]);
    if (digits.length >= 8) return digits;
  }
  return null;
}

export function DriverOrderCard({
  item,
  footer,
  afterAmountRow,
  variant = "default"
}: {
  item: DriverOrderRow;
  footer?: ReactNode;
  afterAmountRow?: ReactNode;
  /** أرشيف السائق: بدون رقم زبون ولا اتصال (خصوصية). */
  variant?: "default" | "archive";
}) {
  const { theme } = useTheme();
  const contactVisible = showCustomerContact(item.status, variant);
  const displayPhone = resolveCustomerPhone(item);
  const showPhoneBlock = contactVisible && displayPhone != null;
  const pillColors = driverOrderStatusPill(mapStatusForPill(item.status), theme);

  const styles = useThemedStyles((t) => ({
    card: {
      backgroundColor: t.colors.surfaceCard,
      borderRadius: 18,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: t.colors.border,
      direction: "rtl" as const,
      alignItems: "stretch" as const,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
      elevation: 5
    },
    cardTop: {
      flexDirection: "row-reverse" as const,
      justifyContent: "flex-end" as const,
      gap: 8,
      flexWrap: "wrap" as const,
      marginBottom: 10
    },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      overflow: "hidden" as const,
      fontWeight: "800" as const,
      fontSize: 12,
      ...rtlText
    },
    badge: {
      backgroundColor: t.colors.chipBg,
      color: t.colors.chipText,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      overflow: "hidden" as const,
      fontSize: 11,
      fontWeight: "700" as const,
      ...rtlText
    },
    tripTitle: {
      fontSize: 17,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 8,
      textAlign: "right" as const
    },
    addressBlock: {
      gap: 10,
      marginBottom: 12
    },
    notes: {
      color: t.colors.warning,
      ...rtlText,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 10,
      fontWeight: "600" as const,
      textAlign: "right" as const
    },
    pickupBox: {
      backgroundColor: t.colors.infoBg,
      borderWidth: 1,
      borderColor: t.colors.info,
      borderRadius: 12,
      padding: 12,
      alignItems: "flex-end" as const
    },
    dropoffBox: {
      backgroundColor: t.colors.successBg,
      borderWidth: 1,
      borderColor: t.colors.success,
      borderRadius: 12,
      padding: 12,
      alignItems: "flex-end" as const
    },
    addressBoxLabel: {
      fontSize: 12,
      fontWeight: "800" as const,
      color: t.colors.textSecondary,
      ...rtlText,
      marginBottom: 6,
      textAlign: "right" as const
    },
    addressBoxText: {
      fontSize: 14,
      color: t.colors.text,
      ...rtlText,
      lineHeight: 22,
      textAlign: "right" as const
    },
    phoneRow: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      justifyContent: "flex-end" as const,
      flexWrap: "wrap" as const,
      gap: 10,
      marginBottom: 8
    },
    phone: {
      color: t.colors.textMuted,
      ...rtlText,
      flexShrink: 1,
      textAlign: "right" as const
    },
    callBtn: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      gap: 6,
      backgroundColor: t.colors.success,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10
    },
    callBtnPressed: {
      opacity: 0.88
    },
    callBtnText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 13,
      ...rtlText,
      textAlign: "right" as const
    },
    row: {
      flexDirection: "row-reverse" as const,
      justifyContent: "flex-end" as const,
      alignItems: "center" as const,
      gap: 12,
      flexWrap: "wrap" as const,
      marginBottom: 8
    },
    amount: {
      color: t.colors.primary,
      fontWeight: "800" as const,
      fontSize: 16,
      ...rtlText,
      textAlign: "right" as const
    },
    date: {
      color: t.colors.textMuted,
      fontSize: 12,
      ...rtlText,
      textAlign: "right" as const
    },
    driver: {
      color: t.colors.textMuted,
      fontSize: 13,
      ...rtlText,
      marginBottom: 10,
      textAlign: "right" as const
    },
    driverLast: {
      marginBottom: 0
    }
  }));

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={[styles.statusPill, pillColors]}>
          {STATUS_AR[item.status] ?? item.status}
        </Text>
        <Text style={styles.badge}>{BROADCAST_AR[item.broadcastTarget] ?? item.broadcastTarget}</Text>
        <Text style={styles.badge}>
          سيارة: {VEHICLE_REQ_AR[item.vehicleRequirement ?? "ANY"] ?? (item.vehicleRequirement ?? "ANY")}
        </Text>
      </View>
      <Text style={styles.tripTitle}>طلب تكسي</Text>
      {showPhoneBlock ? (
        <View style={styles.phoneRow}>
          <Text style={styles.phone}>
            {displayPhone ?? (item.customerName?.trim() ? `الزبون: ${item.customerName.trim()}` : "—")}
          </Text>
          {displayPhone ? (
            <Pressable
              style={({ pressed }) => [styles.callBtn, pressed && styles.callBtnPressed]}
              onPress={() => void openCustomerDialer(displayPhone)}
              accessibilityRole="button"
              accessibilityLabel="اتصل بالزبون"
            >
              <Ionicons name="call" size={16} color={theme.colors.textInverse} />
              <Text style={styles.callBtnText}>اتصل بالزبون</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={styles.addressBlock}>
        <View style={styles.pickupBox}>
          <Text style={styles.addressBoxLabel}>من — الانطلاق</Text>
          <Text style={styles.addressBoxText}>{item.pickupAddress}</Text>
        </View>
        <View style={styles.dropoffBox}>
          <Text style={styles.addressBoxLabel}>إلى — الوجهة</Text>
          <Text style={styles.addressBoxText}>{item.dropoffAddress}</Text>
        </View>
      </View>
      {item.notes?.trim() ? (
        <Text style={styles.notes}>ملاحظات: {item.notes.trim()}</Text>
      ) : null}
      <View style={styles.row}>
        <Text style={styles.amount}>المبلغ: {formatAmount(item.amount)}</Text>
        <Text style={styles.date}>{formatWhen(item.createdAt)}</Text>
      </View>
      {afterAmountRow}
      <Text style={[styles.driver, !footer && !afterAmountRow && styles.driverLast]}>
        السائق: {item.driver?.user?.fullName?.trim() ? item.driver.user.fullName : "لم يُعيَّن بعد"}
      </Text>
      {footer}
    </View>
  );
}
