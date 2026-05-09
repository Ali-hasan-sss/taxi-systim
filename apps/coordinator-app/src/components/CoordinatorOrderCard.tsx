import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { CoordinatorOrderRow } from "../lib/api";

const STATUS_AR: Record<string, string> = {
  PENDING: "معلق",
  ACCEPTED: "قيد التنفيذ",
  ARRIVED: "وصل",
  STARTED: "بدأت الرحلة",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى"
};

const BROADCAST_AR: Record<string, string> = {
  ALL: "جميع السائقين",
  NEAREST_THREE: "أقرب 3 سائقين"
};

function statusPillColors(status: string): { backgroundColor: string; color: string } {
  switch (status) {
    case "PENDING":
      return { backgroundColor: "#b45309", color: "#fffbeb" };
    case "ACCEPTED":
      return { backgroundColor: "#1d4ed8", color: "#eff6ff" };
    case "ARRIVED":
      return { backgroundColor: "#0f766e", color: "#ecfdf5" };
    case "STARTED":
      return { backgroundColor: "#15803d", color: "#f0fdf4" };
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

export function CoordinatorOrderCard({ item, footer }: { item: CoordinatorOrderRow; footer?: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={[styles.statusPill, statusPillColors(item.status)]}>
          {STATUS_AR[item.status] ?? item.status}
        </Text>
        <Text style={styles.badge}>{BROADCAST_AR[item.broadcastTarget] ?? item.broadcastTarget}</Text>
      </View>
      <Text style={styles.customer}>{item.customerName}</Text>
      {item.customerPhone ? <Text style={styles.phone}>{item.customerPhone}</Text> : null}
      <Text style={styles.route}>
        من: {item.pickupAddress}
        {"\n"}
        إلى: {item.dropoffAddress}
      </Text>
      <View style={styles.row}>
        <Text style={styles.amount}>المبلغ: {item.amount}</Text>
        <Text style={styles.date}>{formatWhen(item.createdAt)}</Text>
      </View>
      <Text style={[styles.driver, !footer && styles.driverLast]}>
        السائق: {item.driver?.user?.fullName?.trim() ? item.driver.user.fullName : "لم يُعيَّن بعد"}
      </Text>
      {footer}
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
    borderColor: "#334155"
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "flex-end",
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
    fontSize: 12
  },
  badge: {
    backgroundColor: "#334155",
    color: "#cbd5e1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "700"
  },
  customer: {
    fontSize: 17,
    fontWeight: "800",
    color: "#f8fafc",
    textAlign: "right",
    marginBottom: 4
  },
  phone: {
    color: "#94a3b8",
    textAlign: "right",
    marginBottom: 8
  },
  route: {
    color: "#cbd5e1",
    textAlign: "right",
    lineHeight: 22,
    marginBottom: 10,
    fontSize: 14
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  amount: {
    color: "#38bdf8",
    fontWeight: "800",
    fontSize: 16
  },
  date: {
    color: "#64748b",
    fontSize: 12
  },
  driver: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "right",
    marginBottom: 10
  },
  driverLast: {
    marginBottom: 0
  }
});
