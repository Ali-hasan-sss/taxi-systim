import type { ReactNode } from "react";
import { useState } from "react";
import * as Linking from "expo-linking";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { CoordinatorOrderRow } from "../lib/api";
import { coordinatorUpdateCompletedOrderAmount } from "../lib/api";
import { feedback } from "../lib/feedback";
import { getSession } from "../lib/session";
import {
  buildWhatsAppChatUrlWithText,
  formatSyrianPhoneForDisplay,
  normalizeSyriaPhoneForWaMe
} from "../lib/whatsapp";
import { rtlText } from "../lib/rtl-text";

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

function buildCustomerTaxiBroMessage(item: CoordinatorOrderRow): string {
  const d = item.driver;
  const driverName = d?.user?.fullName?.trim() || "—";
  const brand = d?.vehicleBrand?.trim();
  const color = d?.vehicleColor?.trim();
  const brandColorParts = [brand, color].filter(Boolean);
  const brandColor = brandColorParts.length ? brandColorParts.join(" - ") : "—";
  const rawPlate = d?.vehicleNumber?.trim() || "";
  const plateDigits = rawPlate ? extractWesternDigits(rawPlate) : "";
  const plateDisplay = plateDigits.length ? toArabicIndicDigits(plateDigits) : rawPlate ? rawPlate : "—";
  const kind =
    d?.vehicleKind === "PUBLIC" ? "عامة" : d?.vehicleKind === "PRIVATE" ? "خاصة" : "—";

  return `*TAXI BRO*.      🚖
*اسم السائق* : ${driverName}
*نوع السيارة* : ${brandColor}
*رقم اللوحة* :  ${plateDisplay}
*نوع السيارة*: ${kind}`;
}

function buildInvoiceWhatsAppMessage(item: CoordinatorOrderRow, coordinatorName: string): string {
  const rawAmt = String(item.amount ?? "").trim();
  const amount = rawAmt !== "" ? rawAmt : "—";
  const coord = coordinatorName.trim() || "—";
  return `*فاتورة طلب*📝
*المنسق*🎀 ${coord}
*الاجرة* ${amount}`;
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
  PRIVATE: "سيارة خاصة"
};

function statusPillColors(status: string): { backgroundColor: string; color: string } {
  switch (status) {
    case "PENDING":
      return { backgroundColor: "#b45309", color: "#fffbeb" };
    case "ACCEPTED":
    case "ARRIVED":
    case "EN_ROUTE_TO_CUSTOMER":
      return { backgroundColor: "#1d4ed8", color: "#eff6ff" };
    case "STARTED":
      return { backgroundColor: "#15803d", color: "#f0fdf4" };
    case "STUCK":
      return { backgroundColor: "#c2410c", color: "#fff7ed" };
    case "COMPLETED":
      return { backgroundColor: "#475569", color: "#f8fafc" };
    case "CANCELLED":
      return { backgroundColor: "#991b1b", color: "#fee2e2" };
    default:
      return { backgroundColor: "#475569", color: "#f1f5f9" };
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
  const [amountModalOpen, setAmountModalOpen] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");
  const [savingAmount, setSavingAmount] = useState(false);

  const contactPhone = resolveCustomerPhoneForWhatsApp(item);
  const waE164 = contactPhone ? normalizeSyriaPhoneForWaMe(contactPhone) : null;
  const displayPhone =
    (waE164 ? `+${waE164}` : "") ||
    formatSyrianPhoneForDisplay(item.customerPhone ?? contactPhone) ||
    contactPhone ||
    "";
  const hasAssignedDriver = Boolean(item.driverId || item.driver?.id);
  const statusKey = typeof item.status === "string" ? item.status.trim().toUpperCase() : "";
  const isCompletedArchive = archiveMode && statusKey === "COMPLETED";

  const canWhatsAppCustomer =
    WHATSAPP_TO_CUSTOMER_STATUSES.has(statusKey) && hasAssignedDriver && Boolean(contactPhone) && Boolean(waE164);
  const waUrl = canWhatsAppCustomer
    ? buildWhatsAppChatUrlWithText(contactPhone, buildCustomerTaxiBroMessage(item))
    : null;

  const invoiceWaUrl =
    isCompletedArchive && contactPhone && waE164
      ? buildWhatsAppChatUrlWithText(
          contactPhone,
          buildInvoiceWhatsAppMessage(item, coordinatorFullName)
        )
      : null;

  const openCustomerWhatsApp = () => {
    if (!waUrl) return;
    void Linking.openURL(waUrl);
  };

  const openInvoiceWhatsApp = () => {
    if (!invoiceWaUrl) return;
    void Linking.openURL(invoiceWaUrl);
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
        <Text style={[styles.statusPill, statusPillColors(item.status)]}>
          {STATUS_AR[item.status] ?? item.status}
        </Text>
        <Text style={styles.badge}>{BROADCAST_AR[item.broadcastTarget] ?? item.broadcastTarget}</Text>
        <Text style={styles.badge}>
          {VEHICLE_REQ_AR[item.vehicleRequirement ?? "ANY"] ?? (item.vehicleRequirement ?? "ANY")}
        </Text>
      </View>
      <Text style={styles.customer}>{item.customerName}</Text>
      {displayPhone ? (
        <View style={styles.phoneRow}>
          <Text style={styles.phone} selectable>
            {displayPhone}
          </Text>
          {waUrl ? (
            <Pressable
              onPress={openCustomerWhatsApp}
              style={({ pressed }) => [styles.waBtn, pressed && styles.waBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="إرسال معلومات السائق للزبون عبر واتساب"
            >
              <Text style={styles.waBtnText}>إرسال المعلومات — واتساب</Text>
            </Pressable>
          ) : null}
          {invoiceWaUrl ? (
            <Pressable
              onPress={openInvoiceWhatsApp}
              style={({ pressed }) => [styles.waInvoiceBtn, pressed && styles.waBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="إرسال نص الفاتورة للزبون عبر واتساب"
            >
              <Text style={styles.waInvoiceBtnText}>إرسال الفاتورة — واتساب</Text>
            </Pressable>
          ) : null}
        </View>
      ) : isCompletedArchive && invoiceWaUrl ? (
        <View style={styles.phoneRow}>
          <Pressable
            onPress={openInvoiceWhatsApp}
            style={({ pressed }) => [styles.waInvoiceBtn, pressed && styles.waBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="إرسال نص الفاتورة للزبون عبر واتساب"
          >
            <Text style={styles.waInvoiceBtnText}>إرسال الفاتورة — واتساب</Text>
          </Pressable>
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
              placeholderTextColor="#64748b"
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
                  <ActivityIndicator color="#fff" size="small" />
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
    direction: "rtl",
    alignItems: "stretch"
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 10
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
    fontWeight: "800",
    fontSize: 12,
    ...rtlText
  },
  badge: {
    backgroundColor: "#334155",
    color: "#cbd5e1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "700",
    ...rtlText
  },
  customer: {
    fontSize: 17,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText,
    marginBottom: 4
  },
  phoneRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    ...rtlText
  },
  phone: {
    color: "#94a3b8",
    flexShrink: 1,
    ...rtlText
  },
  waBtn: {
    backgroundColor: "#15803d",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10
  },
  waInvoiceBtn: {
    backgroundColor: "#0d9488",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10
  },
  waBtnPressed: {
    opacity: 0.88
  },
  waBtnText: {
    color: "#f0fdf4",
    fontWeight: "800",
    fontSize: 12,
    ...rtlText
  },
  waInvoiceBtnText: {
    color: "#ccfbf1",
    fontWeight: "800",
    fontSize: 12,
    ...rtlText
  },
  route: {
    color: "#cbd5e1",
    ...rtlText,
    lineHeight: 22,
    marginBottom: 10,
    fontSize: 14
  },
  notes: {
    color: "#fde68a",
    ...rtlText,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10
  },
  row: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 8
  },
  amount: {
    color: "#38bdf8",
    fontWeight: "800",
    fontSize: 16,
    ...rtlText
  },
  editAmountBtn: {
    backgroundColor: "#334155",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#475569"
  },
  editAmountBtnText: {
    color: "#e2e8f0",
    fontWeight: "800",
    fontSize: 12,
    ...rtlText
  },
  date: {
    color: "#64748b",
    fontSize: 12,
    ...rtlText
  },
  driver: {
    color: "#94a3b8",
    fontSize: 13,
    ...rtlText,
    marginBottom: 10
  },
  driverLast: {
    marginBottom: 0
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    justifyContent: "center",
    paddingHorizontal: 24
  },
  modalCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155"
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#f8fafc",
    marginBottom: 14,
    ...rtlText
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f8fafc",
    fontSize: 16,
    marginBottom: 18,
    ...rtlText
  },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end"
  },
  modalBtnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#334155"
  },
  modalBtnSecondaryText: {
    color: "#e2e8f0",
    fontWeight: "800",
    fontSize: 15,
    ...rtlText
  },
  modalBtnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    minWidth: 100,
    alignItems: "center"
  },
  modalBtnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    ...rtlText
  }
});
