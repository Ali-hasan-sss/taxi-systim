import { coordinatorOrderStatusPill, useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import type { CoordinatorOrderRow } from "../lib/api";
import {
  coordinatorMarkCustomerInfoSent,
  coordinatorMarkInvoiceSent,
  coordinatorUpdateCompletedOrderAmount
} from "../lib/api";
import { feedback } from "../lib/feedback";
import { getSession } from "../lib/session";
import { openSmsWithText } from "../lib/sms";
import {
  formatSyrianPhoneForDisplay,
  normalizeSyriaPhoneForWaMe,
  openWhatsAppChatWithText
} from "../lib/whatsapp";
import { rtlRow, rtlText } from "../lib/rtl-text";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toArabicIndicDigits(input: string): string {
  return input.replace(/\d/g, (d) => AR_DIGITS[Number(d)] ?? d);
}

/** أرقام ASCII وعربية وفارسية → تسلسل أرقام غربي للوحة */
function extractWesternDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x0660 && cp <= 0x0669) out += String(cp - 0x0660);
    else if (cp >= 0x06f0 && cp <= 0x06f9) out += String(cp - 0x06f0);
    else if (ch >= "0" && ch <= "9") out += ch;
  }
  return out;
}

function buildCustomerDriverInfoLines(item: CoordinatorOrderRow): {
  driverName: string;
  brand: string;
  color: string;
  plateDisplay: string;
} {
  const d = item.driver;
  const driverName = d?.user?.fullName?.trim() || "—";
  const brand = d?.vehicleBrand?.trim() || "—";
  const color = d?.vehicleColor?.trim() || "—";
  const rawPlate = d?.vehicleNumber?.trim() || "";
  const plateDigits = rawPlate ? extractWesternDigits(rawPlate) : "";
  const plateDisplay = plateDigits.length ? toArabicIndicDigits(plateDigits) : rawPlate ? rawPlate : "—";
  return { driverName, brand, color, plateDisplay };
}

function buildCustomerTaxiBroMessage(item: CoordinatorOrderRow): string {
  const { driverName, brand, color, plateDisplay } = buildCustomerDriverInfoLines(item);
  return `*TAXI BRO*.      🚖
*اسم السائق* : ${driverName}
*نوع السيارة* : ${brand}
*لون السيارة* : ${color}
*رقم اللوحة* :  ${plateDisplay}`;
}

function buildCustomerTaxiBroSmsMessage(item: CoordinatorOrderRow): string {
  const { driverName, brand, color, plateDisplay } = buildCustomerDriverInfoLines(item);
  return `TAXI BRO 🚖
اسم السائق : ${driverName}
نوع السيارة : ${brand}
لون السيارة : ${color}
رقم اللوحة : ${plateDisplay}`;
}

const INVOICE_BRAND_LABEL = "كونترول BRO";

function buildInvoiceWhatsAppMessage(item: CoordinatorOrderRow, coordinatorName: string): string {
  const rawAmt = String(item.amount ?? "").trim();
  const amount = rawAmt !== "" ? rawAmt : "—";
  const coord = coordinatorName.trim() || "—";
  return `*فاتورة طلب*📝
*${INVOICE_BRAND_LABEL}*🎀 ${coord}
*الاجرة* ${amount}`;
}

function buildInvoiceSmsMessage(item: CoordinatorOrderRow, coordinatorName: string): string {
  const rawAmt = String(item.amount ?? "").trim();
  const amount = rawAmt !== "" ? rawAmt : "—";
  const coord = coordinatorName.trim() || "—";
  return `فاتورة طلب 📝
${INVOICE_BRAND_LABEL} 🎀 ${coord}
الاجرة ${amount}`;
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
  ANY: "سيارة: غير مهم",
  PUBLIC: "سيارة عامة",
  PRIVATE: "سيارة خاصة",
  VIP: "سيارة VIP"
};

function normalizeStatusForPill(status: string): string {
  const s = status.trim().toUpperCase();
  if (s === "EN_ROUTE_TO_CUSTOMER" || s === "ARRIVED" || s === "STARTED") return "EN_ROUTE";
  return s;
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

/** حالات يكون فيها السائق «متجهًا للزبون» ويُفترض وجود رقم للتواصل */
const WHATSAPP_TO_CUSTOMER_STATUSES = new Set([
  "EN_ROUTE_TO_CUSTOMER",
  "ACCEPTED",
  "ARRIVED"
]);

function toWesternDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

/** رقم للواتساب: الحقل أولًا ثم استخراج من اسم «زبون …» أو تسلسل أرقام في الاسم */
function resolveCustomerPhoneForWhatsApp(row: CoordinatorOrderRow): string | null {
  const directRaw = row.customerPhone;
  const direct = directRaw != null && String(directRaw).trim() !== "" ? String(directRaw).trim() : "";
  if (direct) return direct;
  const name = toWesternDigits(row.customerName?.trim() ?? "");
  const m = name.match(/زبون\s+([\d\s\-–—().+]+)/);
  if (m?.[1]) {
    const inner = m[1].replace(/\D/g, "");
    if (inner.length >= 8) return inner;
  }
  const collapsed = name.replace(/\D/g, "");
  if (collapsed.length >= 8 && collapsed.length <= 14) return collapsed;
  const loose = name.match(/(?:\+?963|00963)?0?9\d{8}/);
  if (loose) {
    const inner = loose[0].replace(/\D/g, "");
    if (inner.length >= 8) return inner;
  }
  return null;
}

export type CoordinatorOrderCardProps = {
  item: CoordinatorOrderRow;
  footer?: ReactNode;
  archiveMode?: boolean;
  coordinatorFullName?: string;
  onOrderUpdated?: (row: CoordinatorOrderRow) => void;
};

export function CoordinatorOrderCard({
  item,
  footer,
  archiveMode = false,
  coordinatorFullName = "—",
  onOrderUpdated
}: CoordinatorOrderCardProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles((t) => ({
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: t.colors.border,
      direction: "rtl" as const,
      alignItems: "stretch" as const
    },
    cardTop: {
      flexDirection: "row-reverse" as const,
      justifyContent: "flex-start" as const,
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
    customer: {
      fontSize: 17,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      marginBottom: 4
    },
    phoneBlock: {
      marginBottom: 8,
      alignItems: "stretch" as const
    },
    phoneActionsRow: {
      ...rtlRow,
      flexWrap: "wrap" as const,
      gap: 8,
      justifyContent: "flex-start" as const
    },
    actionBtnGroup: {
      ...rtlRow,
      gap: 8,
      flexShrink: 0 as const,
      flexWrap: "nowrap" as const
    },
    phone: {
      color: t.colors.textMuted,
      ...rtlText,
      marginBottom: 6
    },
    iconActionBtn: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: "center" as const,
      justifyContent: "center" as const
    },
    smsIconActionBtn: {
      height: 40,
      borderRadius: 10,
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 4,
      paddingHorizontal: 10
    },
    smsBtnText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 12,
      ...rtlText
    },
    waBtn: {
      backgroundColor: t.colors.whatsapp
    },
    waInvoiceBtn: {
      backgroundColor: t.colors.navigate
    },
    smsInvoiceBtn: {
      backgroundColor: t.colors.copy
    },
    copyBtn: {
      backgroundColor: t.colors.buttonSecondaryBg,
      borderWidth: 1,
      borderColor: t.colors.borderStrong
    },
    waBtnPressed: {
      opacity: 0.88
    },
    sentBadge: {
      backgroundColor: t.colors.successBg,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.colors.success
    },
    sentBadgeText: {
      color: t.colors.successText,
      fontWeight: "800" as const,
      fontSize: 11,
      ...rtlText
    },
    route: {
      color: t.colors.textSecondary,
      ...rtlText,
      lineHeight: 22,
      marginBottom: 10,
      fontSize: 14
    },
    notes: {
      color: t.colors.warningText,
      ...rtlText,
      fontSize: 13,
      lineHeight: 20,
      marginBottom: 10
    },
    row: {
      flexDirection: "row-reverse" as const,
      justifyContent: "flex-start" as const,
      alignItems: "center" as const,
      gap: 12,
      flexWrap: "wrap" as const,
      marginBottom: 8
    },
    amount: {
      color: t.colors.accent,
      fontWeight: "800" as const,
      fontSize: 16,
      ...rtlText
    },
    editAmountBtn: {
      backgroundColor: t.colors.buttonSecondaryBg,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.colors.borderStrong
    },
    editAmountBtnText: {
      color: t.colors.buttonSecondaryText,
      fontWeight: "800" as const,
      fontSize: 12,
      ...rtlText
    },
    date: {
      color: t.colors.textSubtle,
      fontSize: 12,
      ...rtlText
    },
    driver: {
      color: t.colors.textMuted,
      fontSize: 13,
      ...rtlText,
      marginBottom: 10
    },
    driverLast: {
      marginBottom: 0
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: t.colors.overlayLight,
      justifyContent: "center" as const,
      paddingHorizontal: 24
    },
    modalCard: {
      backgroundColor: t.colors.modalBg,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: t.colors.modalBorder
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: "800" as const,
      color: t.colors.text,
      marginBottom: 14,
      ...rtlText
    },
    modalInput: {
      borderWidth: 1,
      borderColor: t.colors.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: t.colors.text,
      backgroundColor: t.colors.inputBg,
      fontSize: 16,
      marginBottom: 18,
      ...rtlText
    },
    modalActions: {
      flexDirection: "row-reverse" as const,
      flexWrap: "wrap" as const,
      gap: 10,
      justifyContent: "flex-start" as const
    },
    modalBtnSecondary: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: t.colors.buttonSecondaryBg
    },
    modalBtnSecondaryText: {
      color: t.colors.buttonSecondaryText,
      fontWeight: "800" as const,
      fontSize: 15,
      ...rtlText
    },
    modalBtnPrimary: {
      paddingVertical: 12,
      paddingHorizontal: 22,
      borderRadius: 12,
      backgroundColor: t.colors.primary,
      minWidth: 100,
      alignItems: "center" as const
    },
    modalBtnPrimaryText: {
      color: t.colors.textInverse,
      fontWeight: "800" as const,
      fontSize: 15,
      ...rtlText
    }
  }));

  const [amountModalOpen, setAmountModalOpen] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");
  const [savingAmount, setSavingAmount] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState<
    "info" | "info_sms" | "invoice" | "invoice_sms" | null
  >(null);

  const contactPhone = resolveCustomerPhoneForWhatsApp(item);
  const waE164 = contactPhone ? normalizeSyriaPhoneForWaMe(contactPhone) : null;
  const displayPhone =
    (waE164 ? `+${waE164}` : "") ||
    formatSyrianPhoneForDisplay(item.customerPhone ?? contactPhone) ||
    contactPhone ||
    "";
  const hasAssignedDriver = Boolean(item.driverId || item.driver?.id);
  const statusKey = typeof item.status === "string" ? item.status.trim().toUpperCase() : "";
  const isCompleted = statusKey === "COMPLETED";
  const isCompletedArchive = archiveMode && isCompleted;
  const statusPillStyle = coordinatorOrderStatusPill(normalizeStatusForPill(item.status), theme);

  const infoAlreadySent = Boolean(item.customerInfoSentAt);
  const invoiceAlreadySent = Boolean(item.invoiceSentAt);

  const canSendCustomerInfo =
    WHATSAPP_TO_CUSTOMER_STATUSES.has(statusKey) &&
    hasAssignedDriver &&
    Boolean(contactPhone) &&
    Boolean(waE164) &&
    !infoAlreadySent;

  const canSendInvoice =
    isCompleted && Boolean(contactPhone) && Boolean(waE164) && !invoiceAlreadySent;

  const openCustomerWhatsApp = async () => {
    if (!canSendCustomerInfo || !contactPhone) return;
    const session = await getSession();
    if (!session?.accessToken) {
      feedback.error("انتهت الجلسة. سجّل الدخول مجددًا.");
      return;
    }
    setSendingWhatsApp("info");
    try {
      const opened = await openWhatsAppChatWithText(contactPhone, buildCustomerTaxiBroMessage(item), {
        preferBusiness: true
      });
      if (!opened) {
        feedback.warning("تعذر فتح واتساب. تحقق من تثبيت واتساب أو واتساب أعمال.");
        return;
      }
      const updated = await coordinatorMarkCustomerInfoSent(session.accessToken, item.id);
      onOrderUpdated?.(updated);
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إرسال المعلومات");
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const openCustomerSms = async () => {
    if (!canSendCustomerInfo || !contactPhone) return;
    const session = await getSession();
    if (!session?.accessToken) {
      feedback.error("انتهت الجلسة. سجّل الدخول مجددًا.");
      return;
    }
    setSendingWhatsApp("info_sms");
    try {
      const opened = await openSmsWithText(contactPhone, buildCustomerTaxiBroSmsMessage(item));
      if (!opened) {
        feedback.warning("تعذر فتح تطبيق الرسائل. تحقق من تثبيت تطبيق SMS على الجهاز.");
        return;
      }
      const updated = await coordinatorMarkCustomerInfoSent(session.accessToken, item.id);
      onOrderUpdated?.(updated);
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إرسال المعلومات");
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const copyCustomerInfo = async () => {
    if (!canSendCustomerInfo) return;
    try {
      await Clipboard.setStringAsync(buildCustomerTaxiBroSmsMessage(item));
      feedback.success("تم نسخ رسالة المعلومات.");
    } catch {
      feedback.error("تعذر نسخ النص.");
    }
  };

  const openInvoiceWhatsApp = async () => {
    if (!canSendInvoice || !contactPhone) return;
    const session = await getSession();
    if (!session?.accessToken) {
      feedback.error("انتهت الجلسة. سجّل الدخول مجددًا.");
      return;
    }
    setSendingWhatsApp("invoice");
    try {
      const opened = await openWhatsAppChatWithText(
        contactPhone,
        buildInvoiceWhatsAppMessage(item, coordinatorFullName),
        { preferBusiness: true }
      );
      if (!opened) {
        feedback.warning("تعذر فتح واتساب. تحقق من تثبيت واتساب أو واتساب أعمال.");
        return;
      }
      const updated = await coordinatorMarkInvoiceSent(session.accessToken, item.id);
      onOrderUpdated?.(updated);
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إرسال الفاتورة");
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const openInvoiceSms = async () => {
    if (!canSendInvoice || !contactPhone) return;
    const session = await getSession();
    if (!session?.accessToken) {
      feedback.error("انتهت الجلسة. سجّل الدخول مجددًا.");
      return;
    }
    setSendingWhatsApp("invoice_sms");
    try {
      const opened = await openSmsWithText(
        contactPhone,
        buildInvoiceSmsMessage(item, coordinatorFullName)
      );
      if (!opened) {
        feedback.warning("تعذر فتح تطبيق الرسائل. تحقق من تثبيت تطبيق SMS على الجهاز.");
        return;
      }
      const updated = await coordinatorMarkInvoiceSent(session.accessToken, item.id);
      onOrderUpdated?.(updated);
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إرسال الفاتورة");
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const copyInvoice = async () => {
    if (!canSendInvoice) return;
    try {
      await Clipboard.setStringAsync(buildInvoiceSmsMessage(item, coordinatorFullName));
      feedback.success("تم نسخ رسالة الفاتورة.");
    } catch {
      feedback.error("تعذر نسخ النص.");
    }
  };

  const openAmountModal = () => {
    setAmountDraft(String(item.amount ?? ""));
    setAmountModalOpen(true);
  };

  const saveCompletedAmount = async () => {
    const normalized = amountDraft.replace(/,/g, ".").trim();
    const n = Number(normalized);
    if (!Number.isFinite(n) || n <= 0) {
      feedback.warning("أدخل مبلغًا أكبر من صفر.");
      return;
    }
    const session = await getSession();
    if (!session?.accessToken) {
      feedback.error("انتهت الجلسة. سجّل الدخول مجددًا.");
      return;
    }
    setSavingAmount(true);
    try {
      const updated = await coordinatorUpdateCompletedOrderAmount(session.accessToken, item.id, n);
      onOrderUpdated?.(updated);
      feedback.success("تم تحديث الأجرة.");
      setAmountModalOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل الحفظ";
      feedback.error(msg);
    } finally {
      setSavingAmount(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={[styles.statusPill, statusPillStyle]}>
          {STATUS_AR[item.status] ?? item.status}
        </Text>
        <Text style={styles.badge}>{BROADCAST_AR[item.broadcastTarget] ?? item.broadcastTarget}</Text>
        <Text style={styles.badge}>
          {VEHICLE_REQ_AR[item.vehicleRequirement ?? "ANY"] ?? (item.vehicleRequirement ?? "ANY")}
        </Text>
      </View>
      <Text style={styles.customer}>{item.customerName}</Text>
      {displayPhone || canSendCustomerInfo || canSendInvoice || (infoAlreadySent && WHATSAPP_TO_CUSTOMER_STATUSES.has(statusKey)) || (invoiceAlreadySent && isCompleted) ? (
        <View style={styles.phoneBlock}>
          {displayPhone ? (
            <Text style={styles.phone} selectable>
              {displayPhone}
            </Text>
          ) : null}
          {canSendCustomerInfo || canSendInvoice || (infoAlreadySent && WHATSAPP_TO_CUSTOMER_STATUSES.has(statusKey)) || (invoiceAlreadySent && isCompleted) ? (
            <View style={styles.phoneActionsRow}>
              {canSendCustomerInfo ? (
                <View style={styles.actionBtnGroup}>
                  <Pressable
                    onPress={() => void openCustomerWhatsApp()}
                    disabled={sendingWhatsApp != null}
                    style={({ pressed }) => [
                      styles.iconActionBtn,
                      styles.waBtn,
                      (pressed || sendingWhatsApp === "info") && styles.waBtnPressed
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="إرسال معلومات السائق للزبون عبر واتساب"
                  >
                    {sendingWhatsApp === "info" ? (
                      <ActivityIndicator color={theme.colors.textInverse} size="small" />
                    ) : (
                      <Ionicons name="logo-whatsapp" size={22} color={theme.colors.textInverse} />
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => void openCustomerSms()}
                    disabled={sendingWhatsApp != null}
                    style={({ pressed }) => [
                      styles.smsIconActionBtn,
                      styles.smsInvoiceBtn,
                      (pressed || sendingWhatsApp === "info_sms") && styles.waBtnPressed
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="إرسال معلومات السائق للزبون عبر SMS"
                  >
                    {sendingWhatsApp === "info_sms" ? (
                      <ActivityIndicator color={theme.colors.textInverse} size="small" />
                    ) : (
                      <>
                        <Ionicons name="chatbubble-outline" size={18} color={theme.colors.textInverse} />
                        <Text style={styles.smsBtnText}>SMS</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => void copyCustomerInfo()}
                    disabled={sendingWhatsApp != null}
                    style={({ pressed }) => [
                      styles.iconActionBtn,
                      styles.copyBtn,
                      pressed && styles.waBtnPressed
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="نسخ رسالة المعلومات"
                  >
                    <Ionicons name="copy-outline" size={20} color={theme.colors.buttonSecondaryText} />
                  </Pressable>
                </View>
              ) : infoAlreadySent && WHATSAPP_TO_CUSTOMER_STATUSES.has(statusKey) ? (
                <View style={styles.sentBadge}>
                  <Text style={styles.sentBadgeText}>تم إرسال المعلومات</Text>
                </View>
              ) : null}
              {canSendInvoice ? (
                <View style={styles.actionBtnGroup}>
                  <Pressable
                    onPress={() => void openInvoiceWhatsApp()}
                    disabled={sendingWhatsApp != null}
                    style={({ pressed }) => [
                      styles.iconActionBtn,
                      styles.waInvoiceBtn,
                      (pressed || sendingWhatsApp === "invoice") && styles.waBtnPressed
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="إرسال نص الفاتورة للزبون عبر واتساب"
                  >
                    {sendingWhatsApp === "invoice" ? (
                      <ActivityIndicator color={theme.colors.textInverse} size="small" />
                    ) : (
                      <Ionicons name="logo-whatsapp" size={22} color={theme.colors.textInverse} />
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => void openInvoiceSms()}
                    disabled={sendingWhatsApp != null}
                    style={({ pressed }) => [
                      styles.smsIconActionBtn,
                      styles.smsInvoiceBtn,
                      (pressed || sendingWhatsApp === "invoice_sms") && styles.waBtnPressed
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="إرسال نص الفاتورة للزبون عبر SMS"
                  >
                    {sendingWhatsApp === "invoice_sms" ? (
                      <ActivityIndicator color={theme.colors.textInverse} size="small" />
                    ) : (
                      <>
                        <Ionicons name="chatbubble-outline" size={18} color={theme.colors.textInverse} />
                        <Text style={styles.smsBtnText}>SMS</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => void copyInvoice()}
                    disabled={sendingWhatsApp != null}
                    style={({ pressed }) => [
                      styles.iconActionBtn,
                      styles.copyBtn,
                      pressed && styles.waBtnPressed
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="نسخ رسالة الفاتورة"
                  >
                    <Ionicons name="copy-outline" size={20} color={theme.colors.buttonSecondaryText} />
                  </Pressable>
                </View>
              ) : invoiceAlreadySent && isCompleted ? (
                <View style={styles.sentBadge}>
                  <Text style={styles.sentBadgeText}>تم إرسال الفاتورة</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.route}>
        من: {item.pickupAddress}
        {"\n"}
        إلى: {item.dropoffAddress}
      </Text>
      {item.notes?.trim() ? (
        <Text style={styles.notes}>
          ملاحظات: {item.notes.trim()}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Text style={styles.amount}>المبلغ: {item.amount}</Text>
        {isCompletedArchive ? (
          <Pressable
            onPress={openAmountModal}
            style={({ pressed }) => [styles.editAmountBtn, pressed && styles.waBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="تعديل أجرة الطلب المكتمل"
          >
            <Text style={styles.editAmountBtnText}>تعديل المبلغ</Text>
          </Pressable>
        ) : null}
        <Text style={styles.date}>{formatWhen(item.createdAt)}</Text>
      </View>
      <Text style={[styles.driver, !footer && styles.driverLast]}>
        السائق: {item.driver?.user?.fullName?.trim() ? item.driver.user.fullName : "لم يُعيَّن بعد"}
      </Text>
      {footer}

      <Modal
        visible={amountModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !savingAmount && setAmountModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => !savingAmount && setAmountModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>تعديل أجرة الطلب المكتمل</Text>
            <TextInput
              value={amountDraft}
              onChangeText={setAmountDraft}
              keyboardType="decimal-pad"
              placeholder="المبلغ"
              placeholderTextColor={theme.colors.placeholder}
              style={styles.modalInput}
              editable={!savingAmount}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => !savingAmount && setAmountModalOpen(false)}
                style={({ pressed }) => [styles.modalBtnSecondary, pressed && styles.waBtnPressed]}
              >
                <Text style={styles.modalBtnSecondaryText}>إلغاء</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveCompletedAmount()}
                disabled={savingAmount}
                style={({ pressed }) => [
                  styles.modalBtnPrimary,
                  (pressed || savingAmount) && styles.waBtnPressed
                ]}
              >
                {savingAmount ? (
                  <ActivityIndicator color={theme.colors.textInverse} size="small" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>حفظ</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
