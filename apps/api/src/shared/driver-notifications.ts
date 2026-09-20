import { prisma } from "./prisma";
import { sendExpoPush } from "./expo-push";

export const DRIVER_NOTIFICATION_TYPE = {
  COMPENSATION: "COMPENSATION",
  FINE: "FINE",
  COMMISSION_PAID: "COMMISSION_PAID",
  DISABLED: "DISABLED",
  ENABLED: "ENABLED",
  DEBT_WARNING: "DEBT_WARNING",
  DEBT_SUSPENDED: "DEBT_SUSPENDED",
  DEBT_CLEARED: "DEBT_CLEARED"
} as const;

export type DriverNotificationType =
  (typeof DRIVER_NOTIFICATION_TYPE)[keyof typeof DRIVER_NOTIFICATION_TYPE];

export type DriverNotificationPayload = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

function formatSyp(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("ar", { maximumFractionDigits: 2 })} ل.س`;
}

function toPayload(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}): DriverNotificationPayload {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString()
  };
}

async function resolveDriver(opts: { driverId?: string; userId?: string }) {
  if (opts.driverId) {
    const row = await prisma.driver.findUnique({
      where: { id: opts.driverId },
      select: { id: true, userId: true, user: { select: { expoPushToken: true } } }
    });
    return row
      ? { driverId: row.id, userId: row.userId, expoPushToken: row.user.expoPushToken }
      : null;
  }
  if (opts.userId) {
    const row = await prisma.driver.findUnique({
      where: { userId: opts.userId },
      select: { id: true, userId: true, user: { select: { expoPushToken: true } } }
    });
    return row
      ? { driverId: row.id, userId: row.userId, expoPushToken: row.user.expoPushToken }
      : null;
  }
  return null;
}

export async function createAndEmitDriverNotification(opts: {
  driverId?: string;
  userId?: string;
  type: DriverNotificationType;
  title: string;
  body: string;
}): Promise<DriverNotificationPayload | null> {
  const target = await resolveDriver(opts);
  if (!target) return null;

  const row = await prisma.notification.create({
    data: {
      userId: target.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body
    },
    select: { id: true, type: true, title: true, body: true, readAt: true, createdAt: true }
  });
  const payload = toPayload(row);

  try {
    const { emitDriverNotification, getSocketServer } = await import("../socket");
    const io = getSocketServer();
    if (io) emitDriverNotification(io, target.driverId, payload);
  } catch {
    /* تجاهل فشل السوكت */
  }

  if (target.expoPushToken) {
    void sendExpoPush([target.expoPushToken], {
      title: opts.title,
      body: opts.body,
      data: { type: opts.type, notificationId: row.id }
    }).catch(() => {
      /* تجاهل فشل الدفع */
    });
  }

  return payload;
}

export function scheduleDriverNotification(
  opts: {
    driverId?: string;
    userId?: string;
    type: DriverNotificationType;
    title: string;
    body: string;
  }
) {
  void createAndEmitDriverNotification(opts).catch(() => {
    /* لا نلغي العملية المالية بسبب الإشعار */
  });
}

export function notifyDriverCompensation(driverId: string, amount: number) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.COMPENSATION,
    title: "تعويض جديد",
    body: `تم إضافة تعويض بقيمة ${formatSyp(amount)}.`
  });
}

export function notifyDriverFine(driverId: string, amount: number) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.FINE,
    title: "غرامة جديدة",
    body: `تم تسجيل غرامة بقيمة ${formatSyp(amount)}.`
  });
}

export function notifyDriverCommissionPaid(driverId: string, amount: number) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.COMMISSION_PAID,
    title: "تسديد عمولة",
    body: `تم تسديد مبلغ ${formatSyp(amount)}.`
  });
}

export function notifyDriverDisabled(userId: string) {
  scheduleDriverNotification({
    userId,
    type: DRIVER_NOTIFICATION_TYPE.DISABLED,
    title: "إيقاف عن العمل",
    body: "تم إيقافك عن العمل من الإدارة."
  });
}

export function notifyDriverEnabled(userId: string) {
  scheduleDriverNotification({
    userId,
    type: DRIVER_NOTIFICATION_TYPE.ENABLED,
    title: "العودة للعمل",
    body: "تمت إعادة تفعيل حسابك ويمكنك بدء العمل."
  });
}

export function notifyDriverDebtWarning(driverId: string, remainingDebt: number) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.DEBT_WARNING,
    title: "تنبيه المبلغ المترتب",
    body: `بلغ المبلغ المترتب عليك ${formatSyp(remainingDebt)}. يجب الدفع قبل تجاوز 2000 ل.س لتجنب الإيقاف عن العمل.`
  });
}

export function notifyDriverDebtSuspended(driverId: string) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.DEBT_SUSPENDED,
    title: "إيقاف عن العمل",
    body: `تم إيقافك عن العمل لأن المبلغ المترتب عليك تجاوز 2000 ل.س. سدّد المستحق لتعود للعمل تلقائياً.`
  });
}

export function notifyDriverDebtCleared(driverId: string) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.DEBT_CLEARED,
    title: "العودة للعمل",
    body: "تم تسديد المستحق ويمكنك العودة للعمل."
  });
}

export function serializeNotification(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}): DriverNotificationPayload {
  return toPayload(row);
}
