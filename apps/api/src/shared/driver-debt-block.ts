import type { Prisma } from "@prisma/client";
import { AppError } from "./app-error";
import { prisma } from "./prisma";
import {
  notifyDriverDebtCleared,
  notifyDriverDebtLimitRaised,
  notifyDriverDebtSuspended,
  notifyDriverDebtWarning,
  notifyDriverPrepaidCleared,
  notifyDriverPrepaidSuspended
} from "./driver-notifications";

/** يُستخدم فقط إذا لم يُحفظ حد في إعدادات المنصة بعد. */
export const DEFAULT_COMMISSION_DEBT_LIMIT = 2000;

export type PaymentMode = "POSTPAID" | "PREPAID";

type DebtClient = Prisma.TransactionClient | typeof prisma;

function toNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatDebtAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

/** الرصيد المعروض للسائق في الوضع المسبق: لا يُعرض كسالب. */
export function prepaidCreditFromDebt(remainingDebt: number): number {
  return remainingDebt < 0 ? Math.round((-remainingDebt) * 100) / 100 : 0;
}

export function isDriverBlockedByDebt(remainingDebt: number, limit: number): boolean {
  return remainingDebt > limit;
}

export function isDriverBlockedByPaymentMode(
  remainingDebt: number,
  limit: number,
  mode: PaymentMode
): boolean {
  if (mode === "PREPAID") return remainingDebt >= 0;
  return isDriverBlockedByDebt(remainingDebt, limit);
}

/** تنبيه الرصيد عندما يبلغ المترتب هذه النسبة من حد الإيقاف. */
export const DEBT_WARNING_RATIO = 0.75;

export function debtWarningFloor(limit: number): number {
  if (limit <= 0) return limit;
  return Math.max(0, Math.round(limit * DEBT_WARNING_RATIO * 100) / 100);
}

export function isDriverDebtWarning(remainingDebt: number, limit: number): boolean {
  if (limit <= 0 || remainingDebt <= 0) return false;
  const warnAt = debtWarningFloor(limit);
  return remainingDebt >= warnAt && remainingDebt <= limit;
}

export function debtSuspendMessage(limit: number): string {
  return `تم إيقافك عن العمل لأن المبلغ المترتب عليك تجاوز ${formatDebtAmount(limit)} ل.س. سدّد المستحق لتعود للعمل تلقائياً.`;
}

export function prepaidSuspendMessage(): string {
  return "تم إيقافك عن العمل لأن رصيدك المسبق أصبح 0. اشحن رصيدك لتعود للعمل.";
}

export function workBlockMessage(mode: PaymentMode, limit: number): string {
  return mode === "PREPAID" ? prepaidSuspendMessage() : debtSuspendMessage(limit);
}

export function debtDispatcherSuspendMessage(limit: number): string {
  return `لا يمكن إسناد الطلب: السائق موقوف عن العمل لأن المبلغ المترتب عليه تجاوز ${formatDebtAmount(limit)} ل.س`;
}

export function prepaidDispatcherSuspendMessage(): string {
  return "لا يمكن إسناد الطلب: رصيد السائق المسبق 0. يجب شحن رصيده أولاً.";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateOrderCommission(
  orderAmount: number,
  commissionType: string,
  commissionValue: number
): number {
  const amount = toNum(orderAmount);
  const value = toNum(commissionValue);
  const raw = commissionType === "PERCENTAGE" ? (amount * value) / 100 : value;
  return roundMoney(raw);
}

export function prepaidCreditInsufficientMessage(credit: number, commission: number): string {
  return `رصيدك المسبق ${formatDebtAmount(credit)} ل.س لا يكفي لعمولة هذا الطلب (${formatDebtAmount(commission)} ل.س). اشحن رصيدك أولاً.`;
}

export function prepaidDispatcherCreditInsufficientMessage(credit: number, commission: number): string {
  return `لا يمكن إسناد الطلب: رصيد السائق المسبق ${formatDebtAmount(credit)} ل.س أقل من عمولة الطلب ${formatDebtAmount(commission)} ل.س`;
}

export function postpaidCommissionWouldExceedLimitMessage(commission: number, limit: number): string {
  return `عمولة هذا الطلب (${formatDebtAmount(commission)} ل.س) ستجعل المبلغ المترتب عليك يتجاوز الحد الأعلى ${formatDebtAmount(limit)} ل.س`;
}

export function postpaidDispatcherCommissionWouldExceedLimitMessage(commission: number, limit: number): string {
  return `لا يمكن إسناد الطلب: عمولة الطلب (${formatDebtAmount(commission)} ل.س) ستجعل المترتب على السائق يتجاوز الحد الأعلى ${formatDebtAmount(limit)} ل.س`;
}

export async function getCommissionPaymentMode(db: DebtClient = prisma): Promise<PaymentMode> {
  const setting = await db.systemSettings.findUnique({
    where: { key: "commission" },
    select: { paymentMode: true }
  });
  return setting?.paymentMode === "PREPAID" ? "PREPAID" : "POSTPAID";
}

export async function getGlobalCommissionDebtLimit(db: DebtClient = prisma): Promise<number> {
  const setting = await db.systemSettings.findUnique({
    where: { key: "commission" },
    select: { commissionDebtLimit: true }
  });
  if (!setting) return DEFAULT_COMMISSION_DEBT_LIMIT;
  const limit = toNum(setting.commissionDebtLimit);
  return limit >= 0 ? limit : DEFAULT_COMMISSION_DEBT_LIMIT;
}

/** حد السائق الفردي إن وُجد، وإلا الحد العام من إعدادات المنصة. */
export async function getEffectiveCommissionDebtLimit(db: DebtClient, driverId: string): Promise<number> {
  const driver = await db.driver.findUnique({
    where: { id: driverId },
    select: { commissionDebtLimit: true }
  });
  if (driver?.commissionDebtLimit != null) {
    const personal = toNum(driver.commissionDebtLimit);
    if (personal >= 0) return personal;
  }
  return getGlobalCommissionDebtLimit(db);
}

export async function readDriverRemainingDebt(db: DebtClient, driverId: string): Promise<number> {
  const row = await db.driverBalance.findUnique({
    where: { driverId },
    select: { remainingDebt: true }
  });
  return toNum(row?.remainingDebt ?? 0);
}

export async function readDriverWorkBlockState(
  db: DebtClient,
  driverId: string
): Promise<{ remainingDebt: number; limit: number; mode: PaymentMode; blocked: boolean; message: string }> {
  const [remainingDebt, limit, mode] = await Promise.all([
    readDriverRemainingDebt(db, driverId),
    getEffectiveCommissionDebtLimit(db, driverId),
    getCommissionPaymentMode(db)
  ]);
  const blocked = isDriverBlockedByPaymentMode(remainingDebt, limit, mode);
  return { remainingDebt, limit, mode, blocked, message: workBlockMessage(mode, limit) };
}

export async function assertDriverCanTakeWork(
  db: DebtClient,
  driverId: string,
  audience: "self" | "dispatcher" = "self"
): Promise<void> {
  const state = await readDriverWorkBlockState(db, driverId);
  if (!state.blocked) return;
  if (audience === "dispatcher") {
    throw new AppError(
      state.mode === "PREPAID"
        ? prepaidDispatcherSuspendMessage()
        : debtDispatcherSuspendMessage(state.limit),
      400
    );
  }
  throw new AppError(state.message, 403);
}

/** يمنع الاستلام/الإسناد إذا كانت عمولة الطلب ستتجاوز الرصيد المسبق أو حد الدين. */
export async function assertDriverCanTakeOrder(
  db: DebtClient,
  driverId: string,
  orderAmount: number,
  audience: "self" | "dispatcher" = "self"
): Promise<void> {
  await assertDriverCanTakeWork(db, driverId, audience);

  const [state, setting] = await Promise.all([
    readDriverWorkBlockState(db, driverId),
    db.systemSettings.findFirst({
      where: { key: "commission" },
      select: { commissionType: true, commissionValue: true }
    })
  ]);
  if (!setting) throw new AppError("إعدادات العمولة غير متوفرة", 400);

  const commission = calculateOrderCommission(
    orderAmount,
    setting.commissionType,
    toNum(setting.commissionValue)
  );
  if (!(commission > 0)) return;

  const projected = roundMoney(state.remainingDebt + commission);

  if (state.mode === "PREPAID") {
    if (projected > 0) {
      const credit = prepaidCreditFromDebt(state.remainingDebt);
      throw new AppError(
        audience === "dispatcher"
          ? prepaidDispatcherCreditInsufficientMessage(credit, commission)
          : prepaidCreditInsufficientMessage(credit, commission),
        audience === "dispatcher" ? 400 : 403
      );
    }
    return;
  }

  if (projected > state.limit) {
    throw new AppError(
      audience === "dispatcher"
        ? postpaidDispatcherCommissionWouldExceedLimitMessage(commission, state.limit)
        : postpaidCommissionWouldExceedLimitMessage(commission, state.limit),
      audience === "dispatcher" ? 400 : 403
    );
  }
}

export async function markDriverOfflineInTxIfDebtBlocked(tx: Prisma.TransactionClient, driverId: string) {
  const state = await readDriverWorkBlockState(tx, driverId);
  if (!state.blocked) return;
  await tx.driver.update({
    where: { id: driverId },
    data: { isOnline: false }
  });
}

export function driverDebtHomeCopy(
  remainingDebt: number,
  limit: number,
  mode: PaymentMode = "POSTPAID"
): {
  workBlocked: boolean;
  debtWarning: boolean;
  workBlockMessage: string | null;
  debtWarningMessage: string | null;
} {
  const workBlocked = isDriverBlockedByPaymentMode(remainingDebt, limit, mode);
  const debtWarning =
    mode === "PREPAID" ? false : isDriverDebtWarning(remainingDebt, limit);
  const formatted = formatDebtAmount(limit);
  return {
    workBlocked,
    debtWarning,
    workBlockMessage: workBlocked ? workBlockMessage(mode, limit) : null,
    debtWarningMessage:
      debtWarning
        ? `تنبيه: تجاوز المترتب 75٪ من الحد الأعلى (${formatted} ل.س). سدّد المستحق قبل تجاوزه لتجنب الإيقاف عن العمل.`
        : null
  };
}

const debtSuspendedDriverIds = new Set<string>();

export function rememberDriverDebtSuspended(driverId: string) {
  debtSuspendedDriverIds.add(driverId);
}

type DebtNotifyBand = "ok" | "warn" | "block";

function debtNotifyBand(remainingDebt: number, limit: number, mode: PaymentMode): DebtNotifyBand {
  if (isDriverBlockedByPaymentMode(remainingDebt, limit, mode)) return "block";
  if (mode !== "PREPAID" && isDriverDebtWarning(remainingDebt, limit)) return "warn";
  return "ok";
}

export type DriverDebtWorkSyncReason = "debt" | "limit" | "topup";

export async function notifyDriverDebtWorkState(
  driverId: string,
  reason: DriverDebtWorkSyncReason = "debt"
): Promise<void> {
  const state = await readDriverWorkBlockState(prisma, driverId);
  const { remainingDebt, limit, mode } = state;
  const band = debtNotifyBand(remainingDebt, limit, mode);
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { lastDebtNotifyBand: true }
  });
  const previous = (driver?.lastDebtNotifyBand as DebtNotifyBand | null) ?? "ok";
  if (previous !== band) {
    await prisma.driver.update({
      where: { id: driverId },
      data: { lastDebtNotifyBand: band }
    });
  }

  const { emitDriverDebtCleared, emitDriverFinanceUpdated, forceDriverOffline, getSocketServer } = await import("../socket");
  const io = getSocketServer();
  if (io) emitDriverFinanceUpdated(io, driverId, remainingDebt);

  if (state.blocked) {
    debtSuspendedDriverIds.add(driverId);
    if (io) {
      await forceDriverOffline(io, driverId, {
        notifyDriver: true,
        reason: "debt",
        message: state.message
      });
    }
    if (previous !== "block") {
      if (mode === "PREPAID") notifyDriverPrepaidSuspended(driverId);
      else notifyDriverDebtSuspended(driverId, limit);
    }
    return;
  }
  const wasSuspended = debtSuspendedDriverIds.delete(driverId);
  if (wasSuspended || previous === "block") {
    if (io) emitDriverDebtCleared(io, driverId, remainingDebt);
    if (reason === "limit") notifyDriverDebtLimitRaised(driverId, limit);
    else if (mode === "PREPAID" || reason === "topup") notifyDriverPrepaidCleared(driverId);
    else notifyDriverDebtCleared(driverId);
  }
  if (band === "warn" && previous !== "warn") {
    notifyDriverDebtWarning(driverId, remainingDebt, limit);
  }
}

export function scheduleDriverDebtWorkSync(
  driverId: string | null | undefined,
  reason: DriverDebtWorkSyncReason = "debt"
) {
  if (!driverId) return;
  void notifyDriverDebtWorkState(driverId, reason).catch(() => {
    /* تجاهل فشل المزامنة حتى لا تُلغى العملية المالية */
  });
}

/** يعيد تقييم السائقين الذين يعتمدون على الحد العام بعد تغييره من الإعدادات. */
export async function syncDriversUsingGlobalDebtLimit() {
  const mode = await getCommissionPaymentMode();
  if (mode === "PREPAID") return;
  const drivers = await prisma.driver.findMany({
    where: { commissionDebtLimit: null, user: { deletedAt: null } },
    select: { id: true }
  });
  for (const driver of drivers) {
    scheduleDriverDebtWorkSync(driver.id, "limit");
  }
}

export async function syncAllDriversWorkBlockState() {
  const drivers = await prisma.driver.findMany({
    where: { user: { deletedAt: null } },
    select: { id: true }
  });
  for (const driver of drivers) {
    scheduleDriverDebtWorkSync(driver.id, "debt");
  }
}
