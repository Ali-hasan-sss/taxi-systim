import { prisma } from "./prisma";
import { sendExpoPush } from "./expo-push";

export const DRIVER_NOTIFICATION_TYPE = {
  COMPENSATION: "COMPENSATION",
  FINE: "FINE",
  DEDUCTION: "DEDUCTION",
  DEBT: "DEBT",
  CREDIT_PAYOUT: "CREDIT_PAYOUT",
  COMMISSION_PAID: "COMMISSION_PAID",
  DISABLED: "DISABLED",
  ENABLED: "ENABLED",
  DEBT_WARNING: "DEBT_WARNING",
  DEBT_SUSPENDED: "DEBT_SUSPENDED",
  DEBT_CLEARED: "DEBT_CLEARED",
  DEBT_LIMIT_RAISED: "DEBT_LIMIT_RAISED"
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

export function notifyDriverDeduction(driverId: string, amount: number, reason: string) {
  const reasonText = reason.trim();
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.DEDUCTION,
    title: "خصم جديد",
    body: reasonText
      ? `تم خصم مبلغ ${formatSyp(amount)}. السبب: ${reasonText}`
      : `تم خصم مبلغ ${formatSyp(amount)}.`
  });
}

export function notifyDriverExtraDebt(
  driverId: string,
  opts: {
    addedAmount: number;
    paidFromCredit: number;
    remainingExtraDebt: number;
    reason?: string;
  }
) {
  const reasonText = opts.reason?.trim() ?? "";
  let body: string;
  if (opts.paidFromCredit > 0 && opts.remainingExtraDebt > 0) {
    body = `تم دفع مبلغ ${formatSyp(opts.paidFromCredit)} وبقي يترتب عليك مبلغ ${formatSyp(opts.remainingExtraDebt)}.`;
  } else if (opts.paidFromCredit > 0) {
    body = `تم دفع مبلغ ${formatSyp(opts.paidFromCredit)} من رصيدك ولم يبقَ دين.`;
  } else if (opts.remainingExtraDebt > opts.addedAmount) {
    body = `تم إضافة دين بقيمة ${formatSyp(opts.addedAmount)}. باقي الدين المترتب عليك ${formatSyp(opts.remainingExtraDebt)}.`;
  } else {
    body = `تم إضافة دين بقيمة ${formatSyp(opts.addedAmount)}.`;
  }
  if (reasonText && opts.remainingExtraDebt > 0) {
    body = `${body} السبب: ${reasonText}`;
  }
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.DEBT,
    title: "دين جديد",
    body
  });
}

export function notifyDriverDueCredit(driverId: string, amount: number, reason: string) {
  const reasonText = reason.trim();
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.COMPENSATION,
    title: "مبلغ لحسابك",
    body: reasonText
      ? `تم إضافة مبلغ ${formatSyp(amount)} ليُخصم من عمولاتك. السبب: ${reasonText}`
      : `تم إضافة مبلغ ${formatSyp(amount)} ليُخصم من عمولاتك.`
  });
}

export function notifyDriverCreditPayout(driverId: string, amount: number) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.CREDIT_PAYOUT,
    title: "تقبيض مبلغ",
    body: `تم تقبيضك مبلغ ${formatSyp(amount)}.`
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

export function notifyDriverDebtWarning(driverId: string, remainingDebt: number, limit: number) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.DEBT_WARNING,
    title: "تنبيه المبلغ المترتب",
    body: `بلغ المبلغ المترتب عليك ${formatSyp(remainingDebt)}. يجب الدفع قبل تجاوز ${formatSyp(limit)} لتجنب الإيقاف عن العمل.`
  });
}

export function notifyDriverDebtSuspended(driverId: string, limit: number) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.DEBT_SUSPENDED,
    title: "إيقاف عن العمل",
    body: `تم إيقافك عن العمل لأن المبلغ المترتب عليك تجاوز ${formatSyp(limit)}. سدّد المستحق لتعود للعمل تلقائياً.`
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

export function notifyDriverDebtLimitRaised(driverId: string, limit: number) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.DEBT_LIMIT_RAISED,
    title: "العودة للعمل",
    body: `تم رفع الحد الأعلى للمبلغ المترتب عليك إلى ${formatSyp(limit)} ويمكنك العودة للعمل.`
  });
}

export function notifyDriverPrepaidSuspended(driverId: string) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.DEBT_SUSPENDED,
    title: "إيقاف عن العمل",
    body: "تم إيقافك عن العمل لأن رصيدك المسبق أصبح 0. اشحن رصيدك لتعود للعمل."
  });
}

export function notifyDriverPrepaidCleared(driverId: string) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.DEBT_CLEARED,
    title: "العودة للعمل",
    body: "تم شحن رصيدك ويمكنك العودة للعمل."
  });
}

export function notifyDriverPrepaidTopup(driverId: string, amount: number) {
  scheduleDriverNotification({
    driverId,
    type: DRIVER_NOTIFICATION_TYPE.COMMISSION_PAID,
    title: "شحن رصيد مسبق",
    body: `تم شحن رصيدك بمبلغ ${formatSyp(amount)}.`
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
