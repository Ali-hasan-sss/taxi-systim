import type { Prisma } from "@prisma/client";
import { AppError } from "./app-error";
import { prisma } from "./prisma";
import {
  notifyDriverDebtCleared,
  notifyDriverDebtSuspended,
  notifyDriverDebtWarning
} from "./driver-notifications";

export const DRIVER_DEBT_SUSPEND_LIMIT = 2000;
export const DRIVER_DEBT_WARN_LIMIT = 1700;

type DebtClient = Prisma.TransactionClient | typeof prisma;

function toNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function isDriverBlockedByDebt(remainingDebt: number): boolean {
  return remainingDebt > DRIVER_DEBT_SUSPEND_LIMIT;
}

export function isDriverDebtWarning(remainingDebt: number): boolean {
  return remainingDebt >= DRIVER_DEBT_WARN_LIMIT && remainingDebt <= DRIVER_DEBT_SUSPEND_LIMIT;
}

export async function readDriverRemainingDebt(db: DebtClient, driverId: string): Promise<number> {
  const row = await db.driverBalance.findUnique({
    where: { driverId },
    select: { remainingDebt: true }
  });
  return toNum(row?.remainingDebt ?? 0);
}

export async function assertDriverCanTakeWork(
  db: DebtClient,
  driverId: string,
  audience: "self" | "dispatcher" = "self"
): Promise<void> {
  const debt = await readDriverRemainingDebt(db, driverId);
  if (!isDriverBlockedByDebt(debt)) return;
  if (audience === "dispatcher") {
    throw new AppError(
      `لا يمكن إسناد الطلب: السائق موقوف عن العمل لأن المبلغ المترتب عليه تجاوز ${DRIVER_DEBT_SUSPEND_LIMIT} ل.س`,
      400
    );
  }
  throw new AppError(
    `تم إيقافك عن العمل لأن المبلغ المترتب عليك تجاوز ${DRIVER_DEBT_SUSPEND_LIMIT} ل.س. سدّد المستحق لتعود للعمل تلقائياً.`,
    403
  );
}

export async function markDriverOfflineInTxIfDebtBlocked(tx: Prisma.TransactionClient, driverId: string) {
  const debt = await readDriverRemainingDebt(tx, driverId);
  if (!isDriverBlockedByDebt(debt)) return;
  await tx.driver.update({
    where: { id: driverId },
    data: { isOnline: false }
  });
}

export function driverDebtHomeCopy(remainingDebt: number): {
  workBlocked: boolean;
  debtWarning: boolean;
  workBlockMessage: string | null;
  debtWarningMessage: string | null;
} {
  const workBlocked = isDriverBlockedByDebt(remainingDebt);
  const debtWarning = isDriverDebtWarning(remainingDebt);
  return {
    workBlocked,
    debtWarning,
    workBlockMessage: workBlocked
      ? `تم إيقافك عن العمل لأن المبلغ المترتب عليك تجاوز ${DRIVER_DEBT_SUSPEND_LIMIT} ل.س. سدّد العمولات والغرامات لتعود للعمل تلقائياً.`
      : null,
    debtWarningMessage: debtWarning
      ? `يجب الدفع قبل تجاوز ${DRIVER_DEBT_SUSPEND_LIMIT} ل.س لتجنب الإيقاف عن العمل.`
      : null
  };
}

const debtSuspendedDriverIds = new Set<string>();

export function rememberDriverDebtSuspended(driverId: string) {
  debtSuspendedDriverIds.add(driverId);
}

type DebtNotifyBand = "ok" | "warn" | "block";

function debtNotifyBand(remainingDebt: number): DebtNotifyBand {
  if (isDriverBlockedByDebt(remainingDebt)) return "block";
  if (isDriverDebtWarning(remainingDebt)) return "warn";
  return "ok";
}

export async function notifyDriverDebtWorkState(driverId: string): Promise<void> {
  const debt = await readDriverRemainingDebt(prisma, driverId);
  const band = debtNotifyBand(debt);
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

  const { emitDriverDebtCleared, forceDriverOffline, getSocketServer } = await import("../socket");
  const io = getSocketServer();
  if (isDriverBlockedByDebt(debt)) {
    debtSuspendedDriverIds.add(driverId);
    if (io) {
      await forceDriverOffline(io, driverId, { notifyDriver: true, reason: "debt" });
    }
    if (previous !== "block") notifyDriverDebtSuspended(driverId);
    return;
  }
  const wasSuspended = debtSuspendedDriverIds.delete(driverId);
  if (wasSuspended || previous === "block") {
    if (io) emitDriverDebtCleared(io, driverId, debt);
    notifyDriverDebtCleared(driverId);
  }
  if (band === "warn" && previous !== "warn") {
    notifyDriverDebtWarning(driverId, debt);
  }
}

export function scheduleDriverDebtWorkSync(driverId: string | null | undefined) {
  if (!driverId) return;
  void notifyDriverDebtWorkState(driverId).catch(() => {
    /* تجاهل فشل المزامنة حتى لا تُلغى العملية المالية */
  });
}
