import {
  CommissionPaymentStatus,
  FinancialTransactionType,
  OrderStatus,
  Prisma
} from "@prisma/client";
import ExcelJS from "exceljs";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { getCommissionPaymentMode, scheduleDriverDebtWorkSync } from "../../shared/driver-debt-block";
import {
  notifyDriverCommissionPaid,
  notifyDriverCompensation,
  notifyDriverCreditPayout,
  notifyDriverDeduction,
  notifyDriverDueCredit,
  notifyDriverExtraDebt,
  notifyDriverFine,
  notifyDriverPrepaidTopup
} from "../../shared/driver-notifications";

const toNum = (d: Prisma.Decimal | number) => Number(d);
const roundMoney = (value: number) => Math.round(value * 100) / 100;
const FINANCE_REPORT_PAGE_DEFAULT = 25;
const FINANCE_REPORT_PAGE_MAX = 100;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type FinanceCommissionShape = {
  id: string;
  driverId: string;
  paidAmount: Prisma.Decimal;
  remainingAmount: Prisma.Decimal;
};

type PrismaTx = Prisma.TransactionClient | typeof prisma;

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const p = JSON.parse(raw) as { createdAt?: string; id?: string };
    if (typeof p.createdAt !== "string" || typeof p.id !== "string") return null;
    const createdAt = new Date(p.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: p.id };
  } catch {
    return null;
  }
}

function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(byType.get("year")),
    Number(byType.get("month")) - 1,
    Number(byType.get("day")),
    Number(byType.get("hour")),
    Number(byType.get("minute")),
    Number(byType.get("second"))
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0
): Date {
  let utcTs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  for (let i = 0; i < 2; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(timeZone, new Date(utcTs));
    utcTs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offsetMs;
  }
  return new Date(utcTs);
}

function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const m = YMD_RE.exec(ymd.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function nextYmdDay(ymd: string): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1, 12, 0, 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(next);
}

function todaySyriaYmd(): string {
  return toSyriaYmd(new Date());
}

function toSyriaYmd(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Damascus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function formatDamascusDateTime(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SY", {
    timeZone: "Asia/Damascus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(value);
}

function sanitizeFileNameSegment(value: string): string {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function compensationNotes(notes?: string) {
  return notes?.trim() ? `تعويض سائق: ${notes.trim()}` : "تعويض سائق";
}

function fineNotes(notes?: string) {
  return notes?.trim() ? `غرامة سائق: ${notes.trim()}` : "غرامة سائق";
}

function deductionNotes(reason: string) {
  return `خصم سائق: ${reason.trim()}`;
}

function extraDebtNotes(reason: string, asRemainder: boolean) {
  const trimmed = reason.trim();
  if (asRemainder) {
    return trimmed ? `دين سائق: باقي من الدين — ${trimmed}` : "دين سائق: باقي من الدين";
  }
  return trimmed ? `دين سائق: ${trimmed}` : "دين سائق";
}

function parseFineReason(notes: string | null | undefined): string {
  if (!notes) return "—";
  const trimmed = notes.trim();
  if (trimmed === "غرامة سائق") return "—";
  if (trimmed.startsWith("غرامة سائق:")) {
    const reason = trimmed.slice("غرامة سائق:".length).trim();
    return reason || "—";
  }
  return trimmed;
}

function parseDeductionReason(notes: string | null | undefined): string {
  if (!notes) return "—";
  const trimmed = notes.trim();
  if (trimmed === "خصم سائق") return "—";
  if (trimmed.startsWith("خصم سائق:")) {
    const reason = trimmed.slice("خصم سائق:".length).trim();
    return reason || "—";
  }
  return trimmed;
}

function parseExtraDebtReason(notes: string | null | undefined): string {
  if (!notes) return "—";
  const trimmed = notes.trim();
  if (trimmed === "دين سائق") return "—";
  if (trimmed.startsWith("دين سائق:")) {
    const reason = trimmed.slice("دين سائق:".length).trim();
    return reason || "—";
  }
  return trimmed;
}

function parseCompensationReason(notes: string | null | undefined): string {
  if (!notes) return "—";
  const trimmed = notes.trim();
  if (trimmed === "تعويض سائق") return "—";
  if (trimmed.startsWith("تعويض سائق:")) {
    const reason = trimmed.slice("تعويض سائق:".length).trim();
    return reason || "—";
  }
  return trimmed;
}

function isCancelOrderFineNotes(notes: string | null | undefined): boolean {
  return Boolean(notes && notes.includes("إلغاء الطلب"));
}

function formatCancelOrderFineReason(pickup?: string | null, dropoff?: string | null): string {
  const from = pickup?.trim() || "—";
  const to = dropoff?.trim() || "—";
  return `إلغاء الطلب (${from} - ${to})`;
}

function cancelFineReasonFromNotes(notes: string | null | undefined): string | null {
  const reason = parseFineReason(notes);
  const match = reason.match(/^إلغاء الطلب(?:\s+من السائق)?\s*\((.+)\)\s*$/);
  if (match?.[1]?.trim()) return `إلغاء الطلب (${match[1].trim()})`;
  return null;
}

async function resolveCancelFineReasons(
  rows: Array<{ driverId: string; notes: string | null; createdAt: Date }>
): Promise<Map<number, string>> {
  const resolved = new Map<number, string>();
  const needingLookup: number[] = [];
  rows.forEach((row, index) => {
    if (!isCancelOrderFineNotes(row.notes)) return;
    const fromNotes = cancelFineReasonFromNotes(row.notes);
    if (fromNotes) {
      resolved.set(index, fromNotes);
      return;
    }
    needingLookup.push(index);
  });
  if (needingLookup.length === 0) return resolved;

  const subset = needingLookup.map((i) => rows[i]);
  const driverIds = [...new Set(subset.map((row) => row.driverId))];
  const times = subset.map((row) => row.createdAt.getTime());
  const from = new Date(Math.min(...times) - 120_000);
  const toExclusive = new Date(Math.max(...times) + 120_000);
  const cancelled = await prisma.order.findMany({
    where: {
      driverId: { in: driverIds },
      status: OrderStatus.CANCELLED,
      cancelledAt: { gte: from, lt: toExclusive }
    },
    select: { driverId: true, pickupAddress: true, dropoffAddress: true, cancelledAt: true }
  });

  for (const index of needingLookup) {
    const row = rows[index];
    const match = cancelled
      .filter((order) => order.driverId === row.driverId && order.cancelledAt)
      .sort(
        (a, b) =>
          Math.abs((a.cancelledAt as Date).getTime() - row.createdAt.getTime()) -
          Math.abs((b.cancelledAt as Date).getTime() - row.createdAt.getTime())
      )[0];
    if (match && Math.abs((match.cancelledAt as Date).getTime() - row.createdAt.getTime()) <= 120_000) {
      resolved.set(index, formatCancelOrderFineReason(match.pickupAddress, match.dropoffAddress));
    } else {
      resolved.set(index, "إلغاء الطلب");
    }
  }
  return resolved;
}

function compensationUsage(
  notes: string | null | undefined,
  referenceId: string | null | undefined
): { isUsed: boolean; status: "unused" | "used" | "promo"; statusLabel: string } {
  if (notes?.includes("عرض من المدير")) {
    return { isUsed: true, status: "promo", statusLabel: "مطبّق عبر عرض" };
  }
  if (referenceId) {
    return { isUsed: true, status: "used", statusLabel: "مستخدم في تسديد" };
  }
  return { isUsed: false, status: "unused", statusLabel: "غير مستخدم" };
}

function compensationSource(notes: string | null | undefined): "promo" | "manual" {
  return notes?.includes("عرض من المدير") ? "promo" : "manual";
}

function driverCompensationWhere(opts: { fromUtc: Date; toExclusive: Date; driverId?: string | null }): Prisma.FinancialTransactionWhereInput {
  return {
    type: FinancialTransactionType.MANUAL_ADJUSTMENT,
    referenceId: null,
    notes: { startsWith: "تعويض سائق" },
    createdAt: { gte: opts.fromUtc, lt: opts.toExclusive },
    ...(opts.driverId ? { driverId: opts.driverId } : {})
  };
}

/** غرامات غير مسددة فقط (referenceId = null). */
function driverFineWhere(opts: { fromUtc: Date; toExclusive: Date; driverId?: string | null }): Prisma.FinancialTransactionWhereInput {
  return {
    type: FinancialTransactionType.MANUAL_ADJUSTMENT,
    referenceId: null,
    notes: { startsWith: "غرامة سائق" },
    createdAt: { gte: opts.fromUtc, lt: opts.toExclusive },
    ...(opts.driverId ? { driverId: opts.driverId } : {})
  };
}

/** كل غرامات السجل (مسددة وغير مسددة). */
function driverFineLedgerWhere(opts: {
  fromUtc: Date;
  toExclusive: Date;
  driverId?: string | null;
}): Prisma.FinancialTransactionWhereInput {
  return {
    type: FinancialTransactionType.MANUAL_ADJUSTMENT,
    notes: { startsWith: "غرامة سائق" },
    createdAt: { gte: opts.fromUtc, lt: opts.toExclusive },
    ...(opts.driverId ? { driverId: opts.driverId } : {})
  };
}

/** خصومات غير مسددة فقط (referenceId = null). */
function driverDeductionWhere(opts: { fromUtc: Date; toExclusive: Date; driverId?: string | null }): Prisma.FinancialTransactionWhereInput {
  return {
    type: FinancialTransactionType.MANUAL_ADJUSTMENT,
    referenceId: null,
    notes: { startsWith: "خصم سائق" },
    createdAt: { gte: opts.fromUtc, lt: opts.toExclusive },
    ...(opts.driverId ? { driverId: opts.driverId } : {})
  };
}

function driverDeductionLedgerWhere(opts: {
  fromUtc: Date;
  toExclusive: Date;
  driverId?: string | null;
}): Prisma.FinancialTransactionWhereInput {
  return {
    type: FinancialTransactionType.MANUAL_ADJUSTMENT,
    notes: { startsWith: "خصم سائق" },
    createdAt: { gte: opts.fromUtc, lt: opts.toExclusive },
    ...(opts.driverId ? { driverId: opts.driverId } : {})
  };
}

function driverExtraDebtWhere(opts: { fromUtc: Date; toExclusive: Date; driverId?: string | null }): Prisma.FinancialTransactionWhereInput {
  return {
    type: FinancialTransactionType.MANUAL_ADJUSTMENT,
    referenceId: null,
    notes: { startsWith: "دين سائق" },
    createdAt: { gte: opts.fromUtc, lt: opts.toExclusive },
    ...(opts.driverId ? { driverId: opts.driverId } : {})
  };
}

function driverExtraDebtLedgerWhere(opts: {
  fromUtc: Date;
  toExclusive: Date;
  driverId?: string | null;
}): Prisma.FinancialTransactionWhereInput {
  return {
    type: FinancialTransactionType.MANUAL_ADJUSTMENT,
    notes: { startsWith: "دين سائق" },
    createdAt: { gte: opts.fromUtc, lt: opts.toExclusive },
    ...(opts.driverId ? { driverId: opts.driverId } : {})
  };
}

/** كل تعويضات السجل (إدارية وعروض ترويجية). */
function driverCompensationLedgerWhere(opts: {
  fromUtc: Date;
  toExclusive: Date;
  driverId?: string | null;
}): Prisma.FinancialTransactionWhereInput {
  return {
    type: FinancialTransactionType.MANUAL_ADJUSTMENT,
    notes: { startsWith: "تعويض سائق" },
    createdAt: { gte: opts.fromUtc, lt: opts.toExclusive },
    ...(opts.driverId ? { driverId: opts.driverId } : {})
  };
}

type FinePaymentShape = {
  id: string;
  driverId: string;
  amount: Prisma.Decimal | number;
  referenceId: string | null;
  notes: string | null;
  type: FinancialTransactionType;
};

export async function applyDriverFineInTransaction(
  tx: PrismaTx,
  opts: { driverId: string; amount: number; createdByUserId?: string | null; notes?: string }
) {
  const amount = roundMoney(opts.amount);
  if (!(amount > 0)) throw new AppError("قيمة الغرامة غير صالحة", 400);

  const currentBalance =
    (await tx.driverBalance.findUnique({ where: { driverId: opts.driverId } })) ??
    (await tx.driverBalance.create({ data: { driverId: opts.driverId } }));

  await tx.financialTransaction.create({
    data: {
      driverId: opts.driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      notes: fineNotes(opts.notes),
      createdByUserId: opts.createdByUserId ?? undefined
    }
  });

  const remainingDebt = roundMoney(toNum(currentBalance.remainingDebt) + amount);
  await tx.driverBalance.update({
    where: { driverId: opts.driverId },
    data: {
      remainingDebt: new Prisma.Decimal(remainingDebt.toFixed(2)),
      availableBalance: new Prisma.Decimal(Math.max(0, toNum(currentBalance.availableBalance) - amount).toFixed(2))
    }
  });

  await settleDriverCoveredLedgers(tx, opts.driverId, remainingDebt, opts.createdByUserId);

  return { driverId: opts.driverId, amount };
}

export async function applyDriverDeductionInTransaction(
  tx: PrismaTx,
  opts: { driverId: string; amount: number; reason: string; createdByUserId?: string | null }
) {
  const amount = opts.amount;
  const reason = opts.reason.trim();
  if (!(amount > 0)) throw new AppError("قيمة الخصم غير صالحة", 400);
  if (reason.length < 2) throw new AppError("سبب الخصم مطلوب", 400);

  const currentBalance =
    (await tx.driverBalance.findUnique({ where: { driverId: opts.driverId } })) ??
    (await tx.driverBalance.create({ data: { driverId: opts.driverId } }));

  await tx.financialTransaction.create({
    data: {
      driverId: opts.driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      notes: deductionNotes(reason),
      createdByUserId: opts.createdByUserId ?? undefined
    }
  });

  const remainingDebt = roundMoney(toNum(currentBalance.remainingDebt) + amount);
  await tx.driverBalance.update({
    where: { driverId: opts.driverId },
    data: {
      remainingDebt: new Prisma.Decimal(remainingDebt.toFixed(2)),
      availableBalance: new Prisma.Decimal(Math.max(0, toNum(currentBalance.availableBalance) - amount).toFixed(2))
    }
  });

  await settleDriverCoveredLedgers(tx, opts.driverId, remainingDebt, opts.createdByUserId);

  return { driverId: opts.driverId, amount, reason };
}

export async function applyDriverExtraDebtInTransaction(
  tx: PrismaTx,
  opts: { driverId: string; amount: number; reason?: string; createdByUserId?: string | null }
) {
  const amount = roundMoney(opts.amount);
  const reason = (opts.reason ?? "").trim();
  if (!(amount > 0)) throw new AppError("قيمة الدين غير صالحة", 400);

  const currentBalance =
    (await tx.driverBalance.findUnique({ where: { driverId: opts.driverId } })) ??
    (await tx.driverBalance.create({ data: { driverId: opts.driverId } }));

  const remainingDebtBefore = toNum(currentBalance.remainingDebt);
  const credit = remainingDebtBefore < 0 ? roundMoney(-remainingDebtBefore) : 0;
  const paidFromCredit = roundMoney(Math.min(amount, credit));
  const remainderFromThis = roundMoney(amount - paidFromCredit);

  const unpaid = await loadUnpaidDriverExtraDebts(tx, opts.driverId);
  const previousExtraDebt = roundMoney(unpaid.reduce((sum, row) => sum + toNum(row.amount), 0));
  const remainingExtraDebt = roundMoney(previousExtraDebt + remainderFromThis);
  const asRemainder = paidFromCredit > 0 || previousExtraDebt > 0;
  const notes = extraDebtNotes(reason, asRemainder);

  if (remainingExtraDebt > 0) {
    const keeper = unpaid[unpaid.length - 1] ?? null;
    const supersededIds = unpaid.filter((row) => row.id !== keeper?.id).map((row) => row.id);
    if (keeper) {
      await tx.financialTransaction.update({
        where: { id: keeper.id },
        data: {
          amount: new Prisma.Decimal(remainingExtraDebt.toFixed(2)),
          notes
        }
      });
    } else {
      await tx.financialTransaction.create({
        data: {
          driverId: opts.driverId,
          type: FinancialTransactionType.MANUAL_ADJUSTMENT,
          amount: new Prisma.Decimal(remainingExtraDebt.toFixed(2)),
          notes,
          createdByUserId: opts.createdByUserId ?? undefined
        }
      });
    }
    if (supersededIds.length > 0) {
      await tx.financialTransaction.deleteMany({ where: { id: { in: supersededIds } } });
    }
  } else if (unpaid.length > 0) {
    await markExtraDebtsPaidWithoutBalanceChange(
      tx,
      unpaid,
      opts.createdByUserId,
      "تسديد دين سائق من الرصيد"
    );
  }

  const remainingDebt = roundMoney(remainingDebtBefore + amount);
  await tx.driverBalance.update({
    where: { driverId: opts.driverId },
    data: {
      remainingDebt: new Prisma.Decimal(remainingDebt.toFixed(2)),
      availableBalance: new Prisma.Decimal(Math.max(0, toNum(currentBalance.availableBalance) - amount).toFixed(2))
    }
  });

  await settleDriverCoveredLedgers(tx, opts.driverId, remainingDebt, opts.createdByUserId);

  const leftover = remainingDebt > 0
    ? roundMoney(
        (await loadUnpaidDriverExtraDebts(tx, opts.driverId)).reduce((sum, row) => sum + toNum(row.amount), 0)
      )
    : 0;

  return {
    driverId: opts.driverId,
    amount,
    reason,
    paidFromCredit,
    previousExtraDebt,
    remainingExtraDebt: leftover,
    remainingDebt
  };
}

async function applyExtraDebtPayment(tx: PrismaTx, debt: FinePaymentShape, adminUserId: string, notes?: string) {
  if (debt.type !== FinancialTransactionType.MANUAL_ADJUSTMENT) {
    throw new AppError("المعاملة المحددة ليست دينًا", 400);
  }
  if (!debt.notes?.startsWith("دين سائق")) {
    throw new AppError("المعاملة المحددة ليست دينًا", 400);
  }
  if (debt.referenceId) {
    throw new AppError("تم تسديد هذا الدين بالفعل", 400);
  }

  const amount = toNum(debt.amount);
  if (amount <= 0) throw new AppError("قيمة الدين غير صالحة", 400);

  const payment = await tx.financialTransaction.create({
    data: {
      driverId: debt.driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      referenceId: debt.id,
      notes: notes?.trim() || "تسديد دين سائق",
      createdByUserId: adminUserId
    }
  });

  await tx.financialTransaction.update({
    where: { id: debt.id },
    data: { referenceId: payment.id }
  });

  const balance = await tx.driverBalance.findUnique({ where: { driverId: debt.driverId } });
  if (balance) {
    await tx.driverBalance.update({
      where: { driverId: debt.driverId },
      data: {
        remainingDebt: new Prisma.Decimal((toNum(balance.remainingDebt) - amount).toFixed(2)),
        availableBalance: new Prisma.Decimal((toNum(balance.availableBalance) + amount).toFixed(2))
      }
    });
  }

  return { amount, paymentId: payment.id };
}

async function applyDeductionPayment(tx: PrismaTx, deduction: FinePaymentShape, adminUserId: string, notes?: string) {
  if (deduction.type !== FinancialTransactionType.MANUAL_ADJUSTMENT) {
    throw new AppError("المعاملة المحددة ليست خصمًا", 400);
  }
  if (!deduction.notes?.startsWith("خصم سائق")) {
    throw new AppError("المعاملة المحددة ليست خصمًا", 400);
  }
  if (deduction.referenceId) {
    throw new AppError("تم تسديد هذا الخصم بالفعل", 400);
  }

  const amount = toNum(deduction.amount);
  if (amount <= 0) throw new AppError("قيمة الخصم غير صالحة", 400);

  const payment = await tx.financialTransaction.create({
    data: {
      driverId: deduction.driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      referenceId: deduction.id,
      notes: notes?.trim() || "تسديد خصم سائق",
      createdByUserId: adminUserId
    }
  });

  await tx.financialTransaction.update({
    where: { id: deduction.id },
    data: { referenceId: payment.id }
  });

  const balance = await tx.driverBalance.findUnique({ where: { driverId: deduction.driverId } });
  if (balance) {
    await tx.driverBalance.update({
      where: { driverId: deduction.driverId },
      data: {
        remainingDebt: new Prisma.Decimal((toNum(balance.remainingDebt) - amount).toFixed(2)),
        availableBalance: new Prisma.Decimal((toNum(balance.availableBalance) + amount).toFixed(2))
      }
    });
  }

  return { amount, paymentId: payment.id };
}

async function applyFinePayment(tx: PrismaTx, fine: FinePaymentShape, adminUserId: string, notes?: string) {
  if (fine.type !== FinancialTransactionType.MANUAL_ADJUSTMENT) {
    throw new AppError("المعاملة المحددة ليست غرامة", 400);
  }
  if (!fine.notes?.startsWith("غرامة سائق")) {
    throw new AppError("المعاملة المحددة ليست غرامة", 400);
  }
  if (fine.referenceId) {
    throw new AppError("تم تسديد هذه الغرامة بالفعل", 400);
  }

  const amount = toNum(fine.amount);
  if (amount <= 0) throw new AppError("قيمة الغرامة غير صالحة", 400);

  const payment = await tx.financialTransaction.create({
    data: {
      driverId: fine.driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      referenceId: fine.id,
      notes: notes?.trim() || "تسديد غرامة سائق",
      createdByUserId: adminUserId
    }
  });

  await tx.financialTransaction.update({
    where: { id: fine.id },
    data: { referenceId: payment.id }
  });

  const balance = await tx.driverBalance.findUnique({ where: { driverId: fine.driverId } });
  if (balance) {
    await tx.driverBalance.update({
      where: { driverId: fine.driverId },
      data: {
        remainingDebt: new Prisma.Decimal((toNum(balance.remainingDebt) - amount).toFixed(2)),
        availableBalance: new Prisma.Decimal((toNum(balance.availableBalance) + amount).toFixed(2))
      }
    });
  }

  return { amount, paymentId: payment.id };
}

async function consumeCompensationOnSettlement(
  tx: PrismaTx,
  compensation: { id: string; driverId: string; amount: Prisma.Decimal | number; referenceId: string | null; notes: string | null },
  adminUserId?: string | null,
  notes?: string
) {
  if (!compensation.notes?.startsWith("تعويض سائق")) {
    throw new AppError("المعاملة المحددة ليست تعويضًا", 400);
  }
  if (compensation.referenceId) return;

  const consume = await tx.financialTransaction.create({
    data: {
      driverId: compensation.driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      amount: new Prisma.Decimal(toNum(compensation.amount).toFixed(2)),
      referenceId: compensation.id,
      notes: notes?.trim() || "استهلاك تعويض سائق عند التسديد",
      createdByUserId: adminUserId ?? undefined
    }
  });

  await tx.financialTransaction.update({
    where: { id: compensation.id },
    data: { referenceId: consume.id }
  });
}

async function loadUnusedDriverCompensations(tx: PrismaTx, driverId: string) {
  return tx.financialTransaction.findMany({
    where: {
      driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      referenceId: null,
      notes: { startsWith: "تعويض سائق" }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, driverId: true, amount: true, notes: true, createdAt: true, referenceId: true }
  });
}

async function loadUnpaidDriverDeductions(tx: PrismaTx, driverId: string) {
  return tx.financialTransaction.findMany({
    where: {
      driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      referenceId: null,
      notes: { startsWith: "خصم سائق" }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      driverId: true,
      amount: true,
      referenceId: true,
      notes: true,
      type: true,
      createdAt: true
    }
  });
}

async function loadUnpaidDriverExtraDebts(tx: PrismaTx, driverId: string) {
  return tx.financialTransaction.findMany({
    where: {
      driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      referenceId: null,
      notes: { startsWith: "دين سائق" }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      driverId: true,
      amount: true,
      referenceId: true,
      notes: true,
      type: true,
      createdAt: true
    }
  });
}

async function markExtraDebtsPaidWithoutBalanceChange(
  tx: PrismaTx,
  debts: FinePaymentShape[],
  adminUserId: string | null | undefined,
  notes: string
) {
  for (const debt of debts) {
    if (debt.referenceId) continue;
    const amount = toNum(debt.amount);
    if (!(amount > 0)) continue;
    const payment = await tx.financialTransaction.create({
      data: {
        driverId: debt.driverId,
        type: FinancialTransactionType.MANUAL_ADJUSTMENT,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        referenceId: debt.id,
        notes,
        createdByUserId: adminUserId ?? undefined
      }
    });
    await tx.financialTransaction.update({
      where: { id: debt.id },
      data: { referenceId: payment.id }
    });
  }
}

/** إذا سُدّد الدين أو غُطّي من الرصيد، لا يبقى آخر دين غير مسدد ظاهرًا. */
async function syncUnpaidExtraDebtsToRemaining(
  tx: PrismaTx,
  driverId: string,
  remainingDebt: number,
  adminUserId?: string | null
) {
  const unpaid = await loadUnpaidDriverExtraDebts(tx, driverId);
  if (unpaid.length === 0) return;
  const unpaidSum = roundMoney(unpaid.reduce((sum, row) => sum + toNum(row.amount), 0));
  const allowed = remainingDebt > 0 ? roundMoney(Math.min(unpaidSum, remainingDebt)) : 0;
  if (allowed <= 0) {
    await markExtraDebtsPaidWithoutBalanceChange(
      tx,
      unpaid,
      adminUserId,
      "تسديد دين سائق من الرصيد"
    );
    return;
  }
  if (allowed >= unpaidSum) return;

  const keeper = unpaid[unpaid.length - 1]!;
  const others = unpaid.filter((row) => row.id !== keeper.id);
  const previousReason = parseExtraDebtReason(keeper.notes);
  await tx.financialTransaction.update({
    where: { id: keeper.id },
    data: {
      amount: new Prisma.Decimal(allowed.toFixed(2)),
      notes: extraDebtNotes(previousReason === "—" ? "" : previousReason, true)
    }
  });
  if (others.length > 0) {
    await markExtraDebtsPaidWithoutBalanceChange(tx, others, adminUserId, "دمج دين سائق");
  }
}

async function consumeUnusedCompensationsUpTo(
  tx: PrismaTx,
  driverId: string,
  amount: number,
  adminUserId: string,
  notes?: string
) {
  const target = Math.round(amount * 100) / 100;
  if (!(target > 0)) return 0;
  const unused = await loadUnusedDriverCompensations(tx, driverId);
  let remaining = target;
  let consumed = 0;

  for (const row of unused) {
    if (remaining <= 0) break;
    const rowAmount = Math.round(toNum(row.amount) * 100) / 100;
    if (!(rowAmount > 0)) continue;

    if (rowAmount <= remaining + 0.0001) {
      await consumeCompensationOnSettlement(tx, row, adminUserId, notes);
      remaining = Math.round((remaining - rowAmount) * 100) / 100;
      consumed = Math.round((consumed + rowAmount) * 100) / 100;
      continue;
    }

    const leftover = Math.round((rowAmount - remaining) * 100) / 100;
    await tx.financialTransaction.update({
      where: { id: row.id },
      data: { amount: new Prisma.Decimal(remaining.toFixed(2)) }
    });
    await tx.financialTransaction.create({
      data: {
        driverId,
        type: FinancialTransactionType.MANUAL_ADJUSTMENT,
        amount: new Prisma.Decimal(leftover.toFixed(2)),
        notes: row.notes,
        createdByUserId: adminUserId
      }
    });
    await consumeCompensationOnSettlement(
      tx,
      { ...row, amount: remaining },
      adminUserId,
      notes
    );
    consumed = Math.round((consumed + remaining) * 100) / 100;
    remaining = 0;
  }

  return consumed;
}

async function loadUnpaidDriverFines(tx: PrismaTx, driverId: string) {
  return tx.financialTransaction.findMany({
    where: {
      driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      referenceId: null,
      notes: { startsWith: "غرامة سائق" }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      driverId: true,
      amount: true,
      referenceId: true,
      notes: true,
      type: true,
      createdAt: true
    }
  });
}

async function markFinesPaidWithoutBalanceChange(
  tx: PrismaTx,
  fines: FinePaymentShape[],
  adminUserId: string | null | undefined,
  notes: string
) {
  for (const fine of fines) {
    if (fine.referenceId) continue;
    const amount = toNum(fine.amount);
    if (!(amount > 0)) continue;
    const payment = await tx.financialTransaction.create({
      data: {
        driverId: fine.driverId,
        type: FinancialTransactionType.MANUAL_ADJUSTMENT,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        referenceId: fine.id,
        notes,
        createdByUserId: adminUserId ?? undefined
      }
    });
    await tx.financialTransaction.update({
      where: { id: fine.id },
      data: { referenceId: payment.id }
    });
  }
}

async function addExtraDebtRemainderWithoutBalanceChange(
  tx: PrismaTx,
  driverId: string,
  amount: number,
  reason: string,
  adminUserId?: string | null
) {
  const add = roundMoney(amount);
  if (!(add > 0)) return;
  const unpaid = await loadUnpaidDriverExtraDebts(tx, driverId);
  const previous = roundMoney(unpaid.reduce((sum, row) => sum + toNum(row.amount), 0));
  const combined = roundMoney(previous + add);
  const notes = extraDebtNotes(reason, true);
  const keeper = unpaid[unpaid.length - 1] ?? null;
  if (keeper) {
    await tx.financialTransaction.update({
      where: { id: keeper.id },
      data: {
        amount: new Prisma.Decimal(combined.toFixed(2)),
        notes
      }
    });
    const others = unpaid.filter((row) => row.id !== keeper.id);
    if (others.length > 0) {
      await markExtraDebtsPaidWithoutBalanceChange(tx, others, adminUserId, "دمج دين سائق");
    }
    return;
  }
  await tx.financialTransaction.create({
    data: {
      driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      amount: new Prisma.Decimal(combined.toFixed(2)),
      notes,
      createdByUserId: adminUserId ?? undefined
    }
  });
}

/** الغرامة تبقى في السجل، والمتبقي بعد الرصيد يُعرض في الديون وليس العمولات. */
async function convertUnpaidFinesRemainderToDebts(
  tx: PrismaTx,
  driverId: string,
  remainingDebt: number,
  adminUserId?: string | null
) {
  const unpaidFines = await loadUnpaidDriverFines(tx, driverId);
  if (unpaidFines.length === 0) return;
  const finesSum = roundMoney(unpaidFines.reduce((sum, row) => sum + toNum(row.amount), 0));
  const remainderForDebts = remainingDebt > 0 ? roundMoney(Math.min(finesSum, remainingDebt)) : 0;
  await markFinesPaidWithoutBalanceChange(
    tx,
    unpaidFines,
    adminUserId,
    remainderForDebts > 0 ? "تحويل باقي الغرامة إلى دين" : "تسديد غرامة سائق من الرصيد"
  );
  if (remainderForDebts > 0) {
    await addExtraDebtRemainderWithoutBalanceChange(
      tx,
      driverId,
      remainderForDebts,
      "باقي غرامة",
      adminUserId
    );
  }
}

async function loadUnpaidDriverCommissions(tx: PrismaTx, driverId: string) {
  return tx.commission.findMany({
    where: {
      driverId,
      remainingAmount: { gt: 0 },
      order: { status: OrderStatus.COMPLETED }
    },
    select: {
      id: true,
      driverId: true,
      paidAmount: true,
      remainingAmount: true
    },
    orderBy: [{ id: "asc" }]
  });
}

async function markCommissionsPaidWithoutBalanceChange(
  tx: PrismaTx,
  commissions: FinanceCommissionShape[],
  adminUserId: string | null | undefined,
  notes: string
) {
  for (const commission of commissions) {
    const amount = roundMoney(toNum(commission.remainingAmount));
    if (!(amount > 0)) continue;

    await tx.commissionPayment.create({
      data: {
        commissionId: commission.id,
        driverId: commission.driverId,
        amount,
        notes,
        paidByUserId: adminUserId ?? undefined
      }
    });

    const newPaid = roundMoney(toNum(commission.paidAmount) + amount);
    await tx.commission.update({
      where: { id: commission.id },
      data: {
        paidAmount: new Prisma.Decimal(newPaid.toFixed(2)),
        remainingAmount: new Prisma.Decimal("0.00"),
        paymentStatus: CommissionPaymentStatus.PAID,
        paidAt: new Date()
      }
    });

    const balance = await tx.driverBalance.findUnique({ where: { driverId: commission.driverId } });
    if (balance) {
      await tx.driverBalance.update({
        where: { driverId: commission.driverId },
        data: {
          totalPaidCommissions: new Prisma.Decimal(
            (toNum(balance.totalPaidCommissions) + amount).toFixed(2)
          )
        }
      });
    }

    await tx.financialTransaction.create({
      data: {
        driverId: commission.driverId,
        type: "COMMISSION_PAYMENT",
        amount,
        referenceId: commission.id,
        notes,
        createdByUserId: adminUserId ?? undefined
      }
    });
  }
}

async function markCompensationsUsedWithoutBalanceChange(
  tx: PrismaTx,
  compensations: Array<{
    id: string;
    driverId: string;
    amount: Prisma.Decimal | number;
    referenceId: string | null;
    notes: string | null;
  }>,
  adminUserId: string | null | undefined,
  notes: string
) {
  for (const compensation of compensations) {
    if (compensation.referenceId) continue;
    await consumeCompensationOnSettlement(tx, compensation, adminUserId, notes);
  }
}

async function setUnpaidExtraDebtsToAmount(
  tx: PrismaTx,
  driverId: string,
  extraTarget: number,
  adminUserId?: string | null
) {
  const target = roundMoney(extraTarget);
  const unpaid = await loadUnpaidDriverExtraDebts(tx, driverId);
  if (target <= 0) {
    if (unpaid.length > 0) {
      await markExtraDebtsPaidWithoutBalanceChange(
        tx,
        unpaid,
        adminUserId,
        "تسديد دين سائق من الرصيد"
      );
    }
    return;
  }

  const keeper = unpaid[unpaid.length - 1] ?? null;
  const previousReason = keeper ? parseExtraDebtReason(keeper.notes) : "";
  const reason =
    !previousReason || previousReason === "—" || previousReason.startsWith("باقي من الدين")
      ? "باقي من الرصيد"
      : previousReason;
  const notes = extraDebtNotes(reason, true);

  if (keeper) {
    await tx.financialTransaction.update({
      where: { id: keeper.id },
      data: {
        amount: new Prisma.Decimal(target.toFixed(2)),
        notes
      }
    });
    const others = unpaid.filter((row) => row.id !== keeper.id);
    if (others.length > 0) {
      await markExtraDebtsPaidWithoutBalanceChange(tx, others, adminUserId, "دمج دين سائق");
    }
    return;
  }

  await tx.financialTransaction.create({
    data: {
      driverId,
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      amount: new Prisma.Decimal(target.toFixed(2)),
      notes,
      createdByUserId: adminUserId ?? undefined
    }
  });
}

/**
 * مسبق الدفع: العمولة تُخصم من الرصيد، والتعويض يُضاف إليه ويُعلَّم مستخدمًا.
 * المتبقي يظهر في الديون وليس في العمولات/التعويضات.
 */
export async function settleDriverCoveredLedgers(
  tx: PrismaTx,
  driverId: string,
  remainingDebt: number,
  adminUserId?: string | null
) {
  const mode = await getCommissionPaymentMode(tx);
  if (mode === "PREPAID") {
    const [unusedCompensations, unpaidCommissions, unpaidFines, unpaidDeductions] = await Promise.all([
      loadUnusedDriverCompensations(tx, driverId),
      loadUnpaidDriverCommissions(tx, driverId),
      loadUnpaidDriverFines(tx, driverId),
      loadUnpaidDriverDeductions(tx, driverId)
    ]);
    await markCompensationsUsedWithoutBalanceChange(
      tx,
      unusedCompensations,
      adminUserId,
      "إضافة التعويض إلى الرصيد"
    );
    await markCommissionsPaidWithoutBalanceChange(
      tx,
      unpaidCommissions,
      adminUserId,
      remainingDebt > 0 ? "تحويل باقي العمولة إلى دين" : "تسديد عمولة من الرصيد"
    );
    await markFinesPaidWithoutBalanceChange(
      tx,
      unpaidFines,
      adminUserId,
      remainingDebt > 0 ? "تحويل باقي الغرامة إلى دين" : "تسديد غرامة سائق من الرصيد"
    );
    await markFinesPaidWithoutBalanceChange(
      tx,
      unpaidDeductions,
      adminUserId,
      remainingDebt > 0 ? "تحويل باقي الخصم إلى دين" : "تسديد خصم سائق من الرصيد"
    );
    const extraTarget = remainingDebt > 0 ? roundMoney(remainingDebt) : 0;
    await setUnpaidExtraDebtsToAmount(tx, driverId, extraTarget, adminUserId);
  }
}

function moneyEqZero(value: number): boolean {
  return Math.abs(value) < 0.005;
}

function syriaDayRangeUtc(fromYmd: string, toYmd: string): { from: Date; toExclusive: Date } {
  const fromParts = parseYmd(fromYmd);
  const toParts = parseYmd(toYmd);
  if (!fromParts || !toParts) {
    throw new AppError("صيغة التاريخ يجب أن تكون YYYY-MM-DD", 400);
  }
  if (fromYmd > toYmd) {
    throw new AppError("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية", 400);
  }
  return {
    from: zonedDateTimeToUtc("Asia/Damascus", fromParts.year, fromParts.month, fromParts.day, 0, 0, 0, 0),
    toExclusive: (() => {
      const next = parseYmd(nextYmdDay(toYmd));
      if (!next) throw new AppError("تاريخ النهاية غير صالح", 400);
      return zonedDateTimeToUtc("Asia/Damascus", next.year, next.month, next.day, 0, 0, 0, 0);
    })()
  };
}

function buildOrderRangeWhere(opts?: {
  from?: string | null;
  to?: string | null;
  driverId?: string | null;
  coordinatorId?: string | null;
}) {
  const from = opts?.from?.trim() || todaySyriaYmd();
  const to = opts?.to?.trim() || from;
  const { from: fromUtc, toExclusive } = syriaDayRangeUtc(from, to);
  const baseWhere: Prisma.OrderWhereInput = {
    createdAt: { gte: fromUtc, lt: toExclusive },
    ...(opts?.driverId ? { driverId: opts.driverId } : {}),
    ...(opts?.coordinatorId ? { coordinatorId: opts.coordinatorId } : {})
  };
  return { from, to, fromUtc, toExclusive, baseWhere };
}

async function applyCommissionPayment(
  tx: PrismaTx,
  commission: FinanceCommissionShape,
  amount: number,
  adminUserId: string,
  notes?: string
) {
  if (amount <= 0) throw new AppError("قيمة السداد يجب أن تكون أكبر من صفر", 400);
  if (amount > toNum(commission.remainingAmount)) throw new AppError("قيمة السداد أكبر من المبلغ المتبقي", 400);

  await tx.commissionPayment.create({
    data: {
      commissionId: commission.id,
      driverId: commission.driverId,
      amount,
      notes,
      paidByUserId: adminUserId
    }
  });

  const newPaid = toNum(commission.paidAmount) + amount;
  const newRemaining = toNum(commission.remainingAmount) - amount;
  const status =
    newRemaining === 0 ? CommissionPaymentStatus.PAID : newPaid > 0 ? CommissionPaymentStatus.PARTIAL : CommissionPaymentStatus.UNPAID;

  await tx.commission.update({
    where: { id: commission.id },
    data: {
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      paymentStatus: status,
      paidAt: newRemaining === 0 ? new Date() : null
    }
  });

  const balance = await tx.driverBalance.findUnique({ where: { driverId: commission.driverId } });
  if (balance) {
    await tx.driverBalance.update({
      where: { driverId: commission.driverId },
      data: {
        totalPaidCommissions: toNum(balance.totalPaidCommissions) + amount,
        remainingDebt: toNum(balance.remainingDebt) - amount
      }
    });
  }

  await tx.financialTransaction.create({
    data: {
      driverId: commission.driverId,
      type: "COMMISSION_PAYMENT",
      amount,
      referenceId: commission.id,
      notes: notes ?? "Commission payment"
    }
  });
}

export const accountingService = {
  async recordDriverCompensation(driverId: string, amount: number, adminUserId: string, notes?: string) {
    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        select: { id: true }
      });
      if (!driver) throw new AppError("السائق غير موجود", 404);

      const currentBalance = (await tx.driverBalance.findUnique({ where: { driverId } })) ?? (await tx.driverBalance.create({ data: { driverId } }));

      await tx.financialTransaction.create({
        data: {
          driverId,
          type: FinancialTransactionType.MANUAL_ADJUSTMENT,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          notes: compensationNotes(notes),
          createdByUserId: adminUserId
        }
      });

      const remainingDebt = roundMoney(toNum(currentBalance.remainingDebt) - amount);
      await tx.driverBalance.update({
        where: { driverId },
        data: {
          remainingDebt: new Prisma.Decimal(remainingDebt.toFixed(2)),
          availableBalance: new Prisma.Decimal((toNum(currentBalance.availableBalance) + amount).toFixed(2))
        }
      });
      await settleDriverCoveredLedgers(tx, driverId, remainingDebt, adminUserId);

      return { driverId, amount };
    });
    scheduleDriverDebtWorkSync(driverId);
    notifyDriverCompensation(driverId, amount);
    return result;
  },

  async recordDriverFine(driverId: string, amount: number, adminUserId: string, notes?: string) {
    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        select: { id: true }
      });
      if (!driver) throw new AppError("السائق غير موجود", 404);
      return applyDriverFineInTransaction(tx, {
        driverId,
        amount,
        createdByUserId: adminUserId,
        notes
      });
    });
    scheduleDriverDebtWorkSync(driverId);
    notifyDriverFine(driverId, amount);
    return result;
  },

  async recordDriverDeduction(driverId: string, amount: number, reason: string, adminUserId: string) {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 2) throw new AppError("سبب الخصم مطلوب", 400);
    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        select: { id: true }
      });
      if (!driver) throw new AppError("السائق غير موجود", 404);
      return applyDriverDeductionInTransaction(tx, {
        driverId,
        amount,
        reason: trimmedReason,
        createdByUserId: adminUserId
      });
    });
    scheduleDriverDebtWorkSync(driverId);
    notifyDriverDeduction(driverId, amount, trimmedReason);
    return result;
  },

  async recordDriverExtraDebt(driverId: string, amount: number, reason: string, adminUserId: string) {
    const trimmedReason = reason.trim();
    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        select: { id: true }
      });
      if (!driver) throw new AppError("السائق غير موجود", 404);
      return applyDriverExtraDebtInTransaction(tx, {
        driverId,
        amount,
        reason: trimmedReason,
        createdByUserId: adminUserId
      });
    });
    scheduleDriverDebtWorkSync(driverId);
    notifyDriverExtraDebt(driverId, {
      addedAmount: result.amount,
      paidFromCredit: result.paidFromCredit,
      remainingExtraDebt: result.remainingExtraDebt,
      reason: trimmedReason
    });
    return result;
  },

  async recordDriverDueCredit(driverId: string, amount: number, reason: string, adminUserId: string) {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 2) throw new AppError("سبب المبلغ مطلوب", 400);
    if (!(amount > 0) || amount > 99_999_999.99) {
      throw new AppError("قيمة المبلغ يجب أن تكون رقمًا صالحًا أكبر من صفر", 400);
    }
    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        select: { id: true }
      });
      if (!driver) throw new AppError("السائق غير موجود", 404);

      const currentBalance =
        (await tx.driverBalance.findUnique({ where: { driverId } })) ??
        (await tx.driverBalance.create({ data: { driverId } }));

      await tx.financialTransaction.create({
        data: {
          driverId,
          type: FinancialTransactionType.MANUAL_ADJUSTMENT,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          notes: compensationNotes(trimmedReason),
          createdByUserId: adminUserId
        }
      });

      const remainingDebt = roundMoney(toNum(currentBalance.remainingDebt) - amount);
      await tx.driverBalance.update({
        where: { driverId },
        data: {
          remainingDebt: new Prisma.Decimal(remainingDebt.toFixed(2)),
          availableBalance: new Prisma.Decimal((toNum(currentBalance.availableBalance) + amount).toFixed(2))
        }
      });
      await settleDriverCoveredLedgers(tx, driverId, remainingDebt, adminUserId);

      return { driverId, amount, reason: trimmedReason };
    });
    scheduleDriverDebtWorkSync(driverId);
    notifyDriverDueCredit(driverId, amount, trimmedReason);
    return result;
  },

  async listDriverFines(opts: { driverId?: string | null; from?: string | null; to?: string | null }) {
    let driver: { id: string; fullName: string; phone: string | null } | null = null;
    if (opts.driverId) {
      const row = await prisma.driver.findUnique({
        where: { id: opts.driverId },
        select: {
          id: true,
          user: { select: { fullName: true, phone: true } }
        }
      });
      if (!row) throw new AppError("السائق غير موجود", 404);
      driver = {
        id: row.id,
        fullName: row.user.fullName ?? "",
        phone: row.user.phone ?? null
      };
    }

    const from = opts.from?.trim() || undefined;
    const to = opts.to?.trim() || from;
    const range = from && to ? syriaDayRangeUtc(from, to) : null;
    const rangeOpts = {
      fromUtc: range?.from ?? new Date(0),
      toExclusive: range?.toExclusive ?? new Date("9999-12-31T00:00:00.000Z"),
      driverId: opts.driverId
    };

    const ledgerWhere = driverFineLedgerWhere(rangeOpts);
    const unpaidWhere = driverFineWhere(rangeOpts);

    const [rows, aggregate, unpaidAggregate, balance, paymentMode] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: ledgerWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 300,
        select: {
          id: true,
          amount: true,
          notes: true,
          createdAt: true,
          createdByUserId: true,
          driverId: true,
          referenceId: true,
          driver: {
            select: {
              id: true,
              user: { select: { fullName: true, phone: true } }
            }
          }
        }
      }),
      prisma.financialTransaction.aggregate({
        where: ledgerWhere,
        _sum: { amount: true },
        _count: { _all: true }
      }),
      prisma.financialTransaction.aggregate({
        where: unpaidWhere,
        _sum: { amount: true },
        _count: { _all: true }
      }),
      opts.driverId
        ? prisma.driverBalance.findUnique({
            where: { driverId: opts.driverId },
            select: { remainingDebt: true }
          })
        : Promise.resolve(null),
      getCommissionPaymentMode()
    ]);

    const creatorIds = [...new Set(rows.map((r) => r.createdByUserId).filter((id): id is string => !!id))];
    const creators =
      creatorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, fullName: true }
          })
        : [];
    const creatorById = new Map(creators.map((u) => [u.id, u.fullName]));
    const cancelReasons = await resolveCancelFineReasons(rows);
    const remainingDebt = balance ? toNum(balance.remainingDebt) : 0;
    const prepaid = paymentMode === "PREPAID";
    const leftoverCovered = prepaid && remainingDebt <= 0;
    const unpaidRaw = toNum(unpaidAggregate._sum.amount ?? new Prisma.Decimal(0));

    return {
      driver,
      from: from ?? null,
      to: to ?? null,
      totalAmount: toNum(aggregate._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      count: aggregate._count._all,
      unpaidAmount: prepaid ? "0.00" : unpaidRaw.toFixed(2),
      unpaidCount: prepaid ? 0 : unpaidAggregate._count._all,
      rows: rows.map((row, index) => ({
        id: row.id,
        amount: row.amount.toString(),
        reason: cancelReasons.get(index) ?? parseFineReason(row.notes),
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
        createdByName: row.createdByUserId ? creatorById.get(row.createdByUserId) ?? null : null,
        driverId: row.driverId,
        driverName: row.driver?.user.fullName ?? "—",
        isPaid: leftoverCovered || row.referenceId != null
      }))
    };
  },

  async listDriverCommissions(opts: { driverId?: string | null; from?: string | null; to?: string | null }) {
    let driver: { id: string; fullName: string; phone: string | null } | null = null;
    if (opts.driverId) {
      const row = await prisma.driver.findUnique({
        where: { id: opts.driverId },
        select: {
          id: true,
          user: { select: { fullName: true, phone: true } }
        }
      });
      if (!row) throw new AppError("السائق غير موجود", 404);
      driver = {
        id: row.id,
        fullName: row.user.fullName ?? "",
        phone: row.user.phone ?? null
      };
    }

    const from = opts.from?.trim() || undefined;
    const to = opts.to?.trim() || from;
    const range = from && to ? syriaDayRangeUtc(from, to) : null;
    const createdAt = range
      ? { gte: range.from, lt: range.toExclusive }
      : undefined;
    const where: Prisma.CommissionWhereInput = {
      order: { status: OrderStatus.COMPLETED },
      ...(opts.driverId ? { driverId: opts.driverId } : {}),
      ...(createdAt ? { createdAt } : {})
    };

    const [rows, aggregate, unpaidAggregate, paymentMode] = await Promise.all([
      prisma.commission.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 300,
        select: {
          id: true,
          driverId: true,
          orderId: true,
          calculatedCommission: true,
          paidAmount: true,
          remainingAmount: true,
          paymentStatus: true,
          createdAt: true,
          paidAt: true,
          order: {
            select: {
              pickupAddress: true,
              dropoffAddress: true,
              amount: true
            }
          },
          driver: {
            select: {
              user: { select: { fullName: true, phone: true } }
            }
          }
        }
      }),
      prisma.commission.aggregate({
        where,
        _sum: { calculatedCommission: true },
        _count: { _all: true }
      }),
      prisma.commission.aggregate({
        where: { ...where, remainingAmount: { gt: 0 }, paymentStatus: { not: CommissionPaymentStatus.PAID } },
        _sum: { remainingAmount: true },
        _count: { _all: true }
      }),
      getCommissionPaymentMode()
    ]);

    const prepaid = paymentMode === "PREPAID";
    const unpaidRaw = toNum(unpaidAggregate._sum.remainingAmount ?? new Prisma.Decimal(0));
    const unpaidAmount = prepaid || unpaidRaw <= 0.005 ? 0 : unpaidRaw;
    return {
      driver,
      from: from ?? null,
      to: to ?? null,
      totalAmount: toNum(aggregate._sum.calculatedCommission ?? new Prisma.Decimal(0)).toFixed(2),
      count: aggregate._count._all,
      unpaidAmount: unpaidAmount.toFixed(2),
      unpaidCount: prepaid || unpaidAmount <= 0 ? 0 : unpaidAggregate._count._all,
      rows: rows.map((row) => {
        const remaining = toNum(row.remainingAmount);
        const isPaid =
          prepaid || remaining <= 0.005 || row.paymentStatus === CommissionPaymentStatus.PAID;
        return {
          id: row.id,
          orderId: row.orderId,
          amount: row.calculatedCommission.toString(),
          remainingAmount: prepaid || isPaid ? "0.00" : row.remainingAmount.toString(),
          paidAmount: prepaid || isPaid ? row.calculatedCommission.toString() : row.paidAmount.toString(),
          paymentStatus: isPaid ? "PAID" : row.paymentStatus,
          pickupAddress: row.order.pickupAddress,
          dropoffAddress: row.order.dropoffAddress,
          orderAmount: row.order.amount.toString(),
          createdAt: row.createdAt.toISOString(),
          paidAt: row.paidAt?.toISOString() ?? null,
          driverId: row.driverId,
          driverName: row.driver?.user.fullName ?? "—",
          isPaid
        };
      })
    };
  },

  async listDriverDeductions(opts: { driverId?: string | null; from?: string | null; to?: string | null }) {
    let driver: { id: string; fullName: string; phone: string | null } | null = null;
    if (opts.driverId) {
      const row = await prisma.driver.findUnique({
        where: { id: opts.driverId },
        select: {
          id: true,
          user: { select: { fullName: true, phone: true } }
        }
      });
      if (!row) throw new AppError("السائق غير موجود", 404);
      driver = {
        id: row.id,
        fullName: row.user.fullName ?? "",
        phone: row.user.phone ?? null
      };
    }

    const from = opts.from?.trim() || undefined;
    const to = opts.to?.trim() || from;
    const range = from && to ? syriaDayRangeUtc(from, to) : null;
    const rangeOpts = {
      fromUtc: range?.from ?? new Date(0),
      toExclusive: range?.toExclusive ?? new Date("9999-12-31T00:00:00.000Z"),
      driverId: opts.driverId
    };

    const ledgerWhere = driverDeductionLedgerWhere(rangeOpts);
    const unpaidWhere = driverDeductionWhere(rangeOpts);

    const [rows, aggregate, unpaidAggregate, balance, paymentMode] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: ledgerWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 300,
        select: {
          id: true,
          amount: true,
          notes: true,
          createdAt: true,
          createdByUserId: true,
          driverId: true,
          referenceId: true,
          driver: {
            select: {
              id: true,
              user: { select: { fullName: true, phone: true } }
            }
          }
        }
      }),
      prisma.financialTransaction.aggregate({
        where: ledgerWhere,
        _sum: { amount: true },
        _count: { _all: true }
      }),
      prisma.financialTransaction.aggregate({
        where: unpaidWhere,
        _sum: { amount: true },
        _count: { _all: true }
      }),
      opts.driverId
        ? prisma.driverBalance.findUnique({
            where: { driverId: opts.driverId },
            select: { remainingDebt: true }
          })
        : Promise.resolve(null),
      getCommissionPaymentMode()
    ]);

    const creatorIds = [...new Set(rows.map((r) => r.createdByUserId).filter((id): id is string => !!id))];
    const creators =
      creatorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, fullName: true }
          })
        : [];
    const creatorById = new Map(creators.map((u) => [u.id, u.fullName]));
    const remainingDebt = balance ? toNum(balance.remainingDebt) : 0;
    const prepaid = paymentMode === "PREPAID";
    const leftoverCovered = prepaid && remainingDebt <= 0;
    const unpaidRaw = toNum(unpaidAggregate._sum.amount ?? new Prisma.Decimal(0));

    return {
      driver,
      from: from ?? null,
      to: to ?? null,
      totalAmount: toNum(aggregate._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      count: aggregate._count._all,
      unpaidAmount: prepaid ? "0.00" : unpaidRaw.toFixed(2),
      unpaidCount: prepaid ? 0 : unpaidAggregate._count._all,
      rows: rows.map((row) => ({
        id: row.id,
        amount: row.amount.toString(),
        reason: parseDeductionReason(row.notes),
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
        createdByName: row.createdByUserId ? creatorById.get(row.createdByUserId) ?? null : null,
        driverId: row.driverId,
        driverName: row.driver?.user.fullName ?? "—",
        isPaid: leftoverCovered || row.referenceId != null
      }))
    };
  },

  async listDriverExtraDebts(opts: { driverId?: string | null; from?: string | null; to?: string | null }) {
    let driver: { id: string; fullName: string; phone: string | null } | null = null;
    if (opts.driverId) {
      const row = await prisma.driver.findUnique({
        where: { id: opts.driverId },
        select: {
          id: true,
          user: { select: { fullName: true, phone: true } }
        }
      });
      if (!row) throw new AppError("السائق غير موجود", 404);
      driver = {
        id: row.id,
        fullName: row.user.fullName ?? "",
        phone: row.user.phone ?? null
      };
    }

    const from = opts.from?.trim() || undefined;
    const to = opts.to?.trim() || from;
    const range = from && to ? syriaDayRangeUtc(from, to) : null;
    const rangeOpts = {
      fromUtc: range?.from ?? new Date(0),
      toExclusive: range?.toExclusive ?? new Date("9999-12-31T00:00:00.000Z"),
      driverId: opts.driverId
    };

    const ledgerWhere = driverExtraDebtLedgerWhere(rangeOpts);
    const unpaidWhere = driverExtraDebtWhere(rangeOpts);

    const [rows, aggregate, unpaidAggregate, balance] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: ledgerWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 300,
        select: {
          id: true,
          amount: true,
          notes: true,
          createdAt: true,
          createdByUserId: true,
          driverId: true,
          referenceId: true,
          driver: {
            select: {
              id: true,
              user: { select: { fullName: true, phone: true } }
            }
          }
        }
      }),
      prisma.financialTransaction.aggregate({
        where: ledgerWhere,
        _sum: { amount: true },
        _count: { _all: true }
      }),
      prisma.financialTransaction.aggregate({
        where: unpaidWhere,
        _sum: { amount: true },
        _count: { _all: true }
      }),
      opts.driverId
        ? prisma.driverBalance.findUnique({
            where: { driverId: opts.driverId },
            select: { remainingDebt: true }
          })
        : Promise.resolve(null)
    ]);

    const creatorIds = [...new Set(rows.map((r) => r.createdByUserId).filter((id): id is string => !!id))];
    const creators =
      creatorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, fullName: true }
          })
        : [];
    const creatorById = new Map(creators.map((u) => [u.id, u.fullName]));

    const remainingDebt = balance ? toNum(balance.remainingDebt) : 0;
    const unpaidRaw = toNum(unpaidAggregate._sum.amount ?? new Prisma.Decimal(0));
    const paymentMode = await getCommissionPaymentMode();
    const prepaid = paymentMode === "PREPAID";
    const leftoverCovered = prepaid && remainingDebt <= 0;
    const unpaidAmount = prepaid
      ? leftoverCovered
        ? 0
        : remainingDebt > 0 && unpaidRaw > 0
          ? roundMoney(Math.min(unpaidRaw, remainingDebt))
          : 0
      : unpaidRaw;

    const mapped = rows.map((row) => ({
      id: row.id,
      amount: row.amount.toString(),
      reason: parseExtraDebtReason(row.notes),
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdByUserId ? creatorById.get(row.createdByUserId) ?? null : null,
      driverId: row.driverId,
      driverName: row.driver?.user.fullName ?? "—",
      isPaid: leftoverCovered || row.referenceId != null
    }));
    mapped.sort((a, b) => {
      if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
      return b.createdAt.localeCompare(a.createdAt);
    });

    return {
      driver,
      from: from ?? null,
      to: to ?? null,
      totalAmount: toNum(aggregate._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      count: aggregate._count._all,
      unpaidAmount: unpaidAmount.toFixed(2),
      unpaidCount: leftoverCovered ? 0 : unpaidAggregate._count._all,
      rows: mapped
    };
  },

  async listDriverCompensations(opts: { driverId?: string | null; from?: string | null; to?: string | null }) {
    let driver: { id: string; fullName: string; phone: string | null } | null = null;
    if (opts.driverId) {
      const row = await prisma.driver.findUnique({
        where: { id: opts.driverId },
        select: {
          id: true,
          user: { select: { fullName: true, phone: true } }
        }
      });
      if (!row) throw new AppError("السائق غير موجود", 404);
      driver = {
        id: row.id,
        fullName: row.user.fullName ?? "",
        phone: row.user.phone ?? null
      };
    }

    const from = opts.from?.trim() || undefined;
    const to = opts.to?.trim() || from;
    const range = from && to ? syriaDayRangeUtc(from, to) : null;
    const rangeOpts = {
      fromUtc: range?.from ?? new Date(0),
      toExclusive: range?.toExclusive ?? new Date("9999-12-31T00:00:00.000Z"),
      driverId: opts.driverId
    };

    const ledgerWhere = driverCompensationLedgerWhere(rangeOpts);
    const unusedWhere = driverCompensationWhere(rangeOpts);

    const [rows, aggregate, unusedAggregate] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: ledgerWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 300,
        select: {
          id: true,
          amount: true,
          notes: true,
          createdAt: true,
          createdByUserId: true,
          driverId: true,
          referenceId: true,
          driver: {
            select: {
              id: true,
              user: { select: { fullName: true, phone: true } }
            }
          }
        }
      }),
      prisma.financialTransaction.aggregate({
        where: ledgerWhere,
        _sum: { amount: true },
        _count: { _all: true }
      }),
      prisma.financialTransaction.aggregate({
        where: unusedWhere,
        _sum: { amount: true },
        _count: { _all: true }
      })
    ]);

    const creatorIds = [...new Set(rows.map((r) => r.createdByUserId).filter((id): id is string => !!id))];
    const creators =
      creatorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, fullName: true }
          })
        : [];
    const creatorById = new Map(creators.map((u) => [u.id, u.fullName]));
    const paymentMode = await getCommissionPaymentMode();
    const prepaid = paymentMode === "PREPAID";

    return {
      driver,
      from: from ?? null,
      to: to ?? null,
      totalAmount: toNum(aggregate._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      count: aggregate._count._all,
      unusedAmount: prepaid ? "0.00" : toNum(unusedAggregate._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      unusedCount: prepaid ? 0 : unusedAggregate._count._all,
      rows: rows.map((row) => {
        const source = compensationSource(row.notes);
        const usage = compensationUsage(row.notes, row.referenceId);
        const isUsed = prepaid || usage.isUsed;
        return {
          id: row.id,
          amount: row.amount.toString(),
          reason: parseCompensationReason(row.notes),
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
          createdByName: row.createdByUserId ? creatorById.get(row.createdByUserId) ?? null : null,
          driverId: row.driverId,
          driverName: row.driver?.user.fullName ?? "—",
          source,
          sourceLabel: source === "promo" ? "عرض ترويجي" : "تعويض إداري",
          isUsed,
          status: isUsed ? (usage.status === "promo" ? "promo" : "used") : "unused",
          statusLabel: prepaid
            ? usage.status === "promo"
              ? usage.statusLabel
              : "مضاف إلى الرصيد"
            : usage.statusLabel
        };
      })
    };
  },

  async settleDriverFine(fineId: string, adminUserId: string, notes?: string) {
    const result = await prisma.$transaction(async (tx) => {
      const fine = await tx.financialTransaction.findUnique({
        where: { id: fineId },
        select: {
          id: true,
          driverId: true,
          amount: true,
          referenceId: true,
          notes: true,
          type: true
        }
      });
      if (!fine) throw new AppError("الغرامة غير موجودة", 404);
      const result = await applyFinePayment(tx, fine, adminUserId, notes);
      return { fineId: fine.id, driverId: fine.driverId, amount: result.amount };
    });
    scheduleDriverDebtWorkSync(result.driverId);
    notifyDriverCommissionPaid(result.driverId, result.amount);
    return result;
  },

  async recordCommissionPayment(commissionId: string, amount: number, adminUserId: string, notes?: string) {
    const driverId = await prisma.$transaction(async (tx) => {
      const commission = await tx.commission.findUnique({ where: { id: commissionId } });
      if (!commission) throw new AppError("Commission not found", 404);
      if (amount > toNum(commission.remainingAmount)) throw new AppError("Amount exceeds remaining", 400);
      await applyCommissionPayment(tx, commission, amount, adminUserId, notes);
      return commission.driverId;
    });
    scheduleDriverDebtWorkSync(driverId);
    notifyDriverCommissionPaid(driverId, amount);
  },

  async financeReport(opts?: {
    from?: string | null;
    to?: string | null;
    driverId?: string | null;
    coordinatorId?: string | null;
    cursor?: string | null;
    limit?: number;
  }) {
    const { from, to, fromUtc, toExclusive, baseWhere } = buildOrderRangeWhere(opts);
    const rawLimit = opts?.limit ?? FINANCE_REPORT_PAGE_DEFAULT;
    const limit = Math.min(FINANCE_REPORT_PAGE_MAX, Math.max(1, rawLimit));
    const decoded = opts?.cursor ? decodeCursor(opts.cursor) : null;

    const cursorWhere: Prisma.OrderWhereInput | undefined = decoded
      ? {
          OR: [
            { createdAt: { lt: decoded.createdAt } },
            { AND: [{ createdAt: decoded.createdAt }, { id: { lt: decoded.id } }] }
          ]
        }
      : undefined;
    const where: Prisma.OrderWhereInput = cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere;

    const completedWhere: Prisma.OrderWhereInput = {
      ...baseWhere,
      status: OrderStatus.COMPLETED
    };

    const includeAdjustments = !opts?.coordinatorId || Boolean(opts?.driverId);
    const compensationWhere = includeAdjustments
      ? driverCompensationWhere({
          fromUtc,
          toExclusive,
          driverId: opts?.driverId
        })
      : null;
    const fineWhere = includeAdjustments
      ? driverFineWhere({
          fromUtc,
          toExclusive,
          driverId: opts?.driverId
        })
      : null;
    const deductionWhere = includeAdjustments
      ? driverDeductionWhere({
          fromUtc,
          toExclusive,
          driverId: opts?.driverId
        })
      : null;
    const extraDebtWhere = includeAdjustments
      ? driverExtraDebtWhere({
          fromUtc,
          toExclusive,
          driverId: opts?.driverId
        })
      : null;

    const [
      completedOrdersAggregate,
      totalCommissionAggregate,
      dueCommissionAggregate,
      compensationAggregate,
      fineAggregate,
      deductionAggregate,
      extraDebtAggregate,
      rows
    ] = await Promise.all([
      prisma.order.aggregate({
        where: completedWhere,
        _count: { _all: true },
        _sum: { amount: true }
      }),
      prisma.commission.aggregate({
        where: {
          order: { is: completedWhere }
        },
        _sum: { calculatedCommission: true }
      }),
      prisma.commission.aggregate({
        where: {
          order: { is: completedWhere }
        },
        _sum: { remainingAmount: true }
      }),
      compensationWhere
        ? prisma.financialTransaction.aggregate({
            where: compensationWhere,
            _sum: { amount: true }
          })
        : Promise.resolve({ _sum: { amount: new Prisma.Decimal(0) } }),
      fineWhere
        ? prisma.financialTransaction.aggregate({
            where: fineWhere,
            _sum: { amount: true }
          })
        : Promise.resolve({ _sum: { amount: new Prisma.Decimal(0) } }),
      deductionWhere
        ? prisma.financialTransaction.aggregate({
            where: deductionWhere,
            _sum: { amount: true }
          })
        : Promise.resolve({ _sum: { amount: new Prisma.Decimal(0) } }),
      extraDebtWhere
        ? prisma.financialTransaction.aggregate({
            where: extraDebtWhere,
            _sum: { amount: true }
          })
        : Promise.resolve({ _sum: { amount: new Prisma.Decimal(0) } }),
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: {
          driver: {
            include: {
              user: { select: { fullName: true, phone: true } }
            }
          },
          coordinator: {
            include: {
              user: { select: { fullName: true, phone: true } }
            }
          },
          commission: {
            select: {
              id: true,
              calculatedCommission: true,
              paidAmount: true,
              remainingAmount: true,
              paymentStatus: true,
              paidAt: true
            }
          }
        }
      })
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!) : null;
    const dueCommissionAmount = toNum(dueCommissionAggregate._sum.remainingAmount ?? new Prisma.Decimal(0));
    const compensationAmount = toNum(compensationAggregate._sum.amount ?? new Prisma.Decimal(0));
    const fineAmount = toNum(fineAggregate._sum.amount ?? new Prisma.Decimal(0));
    const deductionAmount = toNum(deductionAggregate._sum.amount ?? new Prisma.Decimal(0));
    const extraDebtAmount = toNum(extraDebtAggregate._sum.amount ?? new Prisma.Decimal(0));
    const adjustedDueCommissionAmount = Math.max(
      0,
      dueCommissionAmount - compensationAmount + fineAmount + deductionAmount + extraDebtAmount
    );

    return {
      rows: page.map((row) => ({
        id: row.id,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        pickupAddress: row.pickupAddress,
        dropoffAddress: row.dropoffAddress,
        amount: row.amount.toString(),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
        driver: row.driver
          ? {
              id: row.driver.id,
              fullName: row.driver.user.fullName ?? "",
              phone: row.driver.user.phone ?? null
            }
          : null,
        coordinator: row.coordinator
          ? {
              id: row.coordinator.id,
              fullName: row.coordinator.user.fullName ?? "",
              phone: row.coordinator.user.phone ?? null
            }
          : null,
        commission: row.commission
          ? {
              id: row.commission.id,
              calculatedCommission: row.commission.calculatedCommission.toString(),
              paidAmount: row.commission.paidAmount.toString(),
              remainingAmount: row.commission.remainingAmount.toString(),
              paymentStatus: row.commission.paymentStatus,
              paidAt: row.commission.paidAt?.toISOString() ?? null
            }
          : null
      })),
      nextCursor,
      summary: {
        completedOrdersCount: completedOrdersAggregate._count._all,
        completedOrdersAmount: (completedOrdersAggregate._sum.amount ?? new Prisma.Decimal(0)).toString(),
        totalCommissionAmount: (totalCommissionAggregate._sum.calculatedCommission ?? new Prisma.Decimal(0)).toString(),
        dueCommissionAmount: dueCommissionAmount.toFixed(2),
        compensationAmount: compensationAmount.toFixed(2),
        fineAmount: fineAmount.toFixed(2),
        deductionAmount: deductionAmount.toFixed(2),
        extraDebtAmount: extraDebtAmount.toFixed(2),
        adjustedDueCommissionAmount: adjustedDueCommissionAmount.toFixed(2),
        from,
        to
      }
    };
  },

  async buildFinanceExportXlsx(opts?: {
    from?: string | null;
    to?: string | null;
    driverId?: string | null;
    coordinatorId?: string | null;
  }) {
    const { from, to, fromUtc, toExclusive, baseWhere } = buildOrderRangeWhere(opts);
    const completedWhere: Prisma.OrderWhereInput = {
      ...baseWhere,
      status: OrderStatus.COMPLETED
    };

    const [driverInfo, coordinatorInfo, rows] = await Promise.all([
      opts?.driverId
        ? prisma.driver.findUnique({
            where: { id: opts.driverId },
            include: {
              user: { select: { fullName: true } }
            }
          })
        : null,
      opts?.coordinatorId
        ? prisma.coordinator.findUnique({
            where: { id: opts.coordinatorId },
            include: {
              user: { select: { fullName: true } }
            }
          })
        : null,
      prisma.order.findMany({
        where: completedWhere,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          driver: {
            include: {
              user: { select: { fullName: true, phone: true } }
            }
          },
          coordinator: {
            include: {
              user: { select: { fullName: true, phone: true } }
            }
          },
          commission: {
            select: {
              calculatedCommission: true,
              remainingAmount: true
            }
          }
        }
      })
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Taxi Office Admin";
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet("Finance Report", {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 4 }]
    });

    const reportTitle = driverInfo?.user.fullName
      ? `تقرير الطلبات المكتملة للسائق: ${driverInfo.user.fullName}`
      : coordinatorInfo?.user.fullName
        ? `تقرير الطلبات المكتملة للمنسق: ${coordinatorInfo.user.fullName}`
        : "تقرير الطلبات المكتملة";
    const periodTitle = `الفترة من ${from} إلى ${to}`;
    const totalAmount = rows.reduce((sum, row) => sum + toNum(row.amount), 0);
    const totalCommission = rows.reduce((sum, row) => sum + (row.commission ? toNum(row.commission.calculatedCommission) : 0), 0);
    const dueCommission = rows.reduce((sum, row) => sum + (row.commission ? toNum(row.commission.remainingAmount) : 0), 0);
    const compensationAmount = driverInfo
      ? toNum(
          (
            await prisma.financialTransaction.aggregate({
              where: driverCompensationWhere({
                fromUtc,
                toExclusive,
                driverId: driverInfo.id
              }),
              _sum: { amount: true }
            })
          )._sum.amount ?? new Prisma.Decimal(0)
        )
      : 0;
    const fineAmount = driverInfo
      ? toNum(
          (
            await prisma.financialTransaction.aggregate({
              where: driverFineWhere({
                fromUtc,
                toExclusive,
                driverId: driverInfo.id
              }),
              _sum: { amount: true }
            })
          )._sum.amount ?? new Prisma.Decimal(0)
        )
      : 0;
    const deductionAmount = driverInfo
      ? toNum(
          (
            await prisma.financialTransaction.aggregate({
              where: driverDeductionWhere({
                fromUtc,
                toExclusive,
                driverId: driverInfo.id
              }),
              _sum: { amount: true }
            })
          )._sum.amount ?? new Prisma.Decimal(0)
        )
      : 0;
    const extraDebtAmount = driverInfo
      ? toNum(
          (
            await prisma.financialTransaction.aggregate({
              where: driverExtraDebtWhere({
                fromUtc,
                toExclusive,
                driverId: driverInfo.id
              }),
              _sum: { amount: true }
            })
          )._sum.amount ?? new Prisma.Decimal(0)
        )
      : 0;
    const adjustedDueCommission = Math.max(
      0,
      dueCommission - compensationAmount + fineAmount + deductionAmount + extraDebtAmount
    );

    const columns: Array<{ header: string; key: string; width: number }> = [
      { header: "رقم الطلب", key: "id", width: 18 },
      { header: "تاريخ الإنشاء", key: "createdAt", width: 22 },
      { header: "تاريخ الإكمال", key: "completedAt", width: 22 },
      { header: "اسم الزبون", key: "customerName", width: 20 },
      { header: "هاتف الزبون", key: "customerPhone", width: 18 },
      { header: "من", key: "pickupAddress", width: 32 },
      { header: "إلى", key: "dropoffAddress", width: 32 },
      { header: "ملاحظات الطلب", key: "notes", width: 28 },
      { header: "اسم السائق", key: "driverName", width: 20 },
      { header: "اسم المنسق", key: "coordinatorName", width: 20 },
      { header: "قيمة الطلب", key: "amount", width: 16 },
      { header: "قيمة العمولة", key: "commission", width: 16 }
    ];

    sheet.columns = columns;
    const lastColumnLetter = sheet.getColumn(columns.length).letter;

    sheet.mergeCells(`A1:${lastColumnLetter}1`);
    sheet.getCell("A1").value = reportTitle;
    sheet.getCell("A1").font = { bold: true, size: 16 };
    sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };

    sheet.mergeCells(`A2:${lastColumnLetter}2`);
    sheet.getCell("A2").value = periodTitle;
    sheet.getCell("A2").font = { bold: true, size: 12 };
    sheet.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };

    sheet.getRow(1).height = 26;
    sheet.getRow(2).height = 22;
    sheet.addRow([]);

    const headerRow = sheet.addRow(columns.map((column) => column.header));
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF0F172A" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" }
      };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } }
      };
    });

    for (const row of rows) {
      const dataRow = sheet.addRow({
        id: row.id,
        createdAt: formatDamascusDateTime(row.createdAt),
        completedAt: formatDamascusDateTime(row.completedAt),
        customerName: row.customerName,
        customerPhone: row.customerPhone ?? "—",
        pickupAddress: row.pickupAddress,
        dropoffAddress: row.dropoffAddress,
        notes: row.notes ?? "—",
        driverName: row.driver?.user.fullName ?? "غير مسند",
        coordinatorName: row.coordinator.user.fullName ?? "—",
        amount: toNum(row.amount),
        commission: row.commission ? toNum(row.commission.calculatedCommission) : 0
      });

      dataRow.getCell(11).numFmt = "#,##0.00";
      dataRow.getCell(12).numFmt = "#,##0.00";

      dataRow.eachCell((cell, columnNumber) => {
        cell.alignment = {
          horizontal: columnNumber >= 11 ? "center" : "right",
          vertical: "top",
          wrapText: true
        };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
      });
    }

    const totalRow = sheet.addRow({
      amount: totalAmount,
      commission: totalCommission
    });
    sheet.mergeCells(`A${totalRow.number}:J${totalRow.number}`);
    totalRow.getCell(1).value = "المجموع العام";
    totalRow.getCell(1).font = { bold: true, color: { argb: "FF0F172A" } };
    totalRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
    totalRow.getCell(11).numFmt = "#,##0.00";
    totalRow.getCell(12).numFmt = "#,##0.00";
    totalRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" }
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } }
      };
      cell.font = { bold: true, color: { argb: "FF0F172A" } };
      if (!cell.alignment) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    });

    if (driverInfo) {
      const compensationRow = sheet.addRow({
        commission: compensationAmount
      });
      sheet.mergeCells(`A${compensationRow.number}:K${compensationRow.number}`);
      compensationRow.getCell(1).value = "مجموع التعويضات";
      compensationRow.getCell(1).font = { bold: true, color: { argb: "FF0F766E" } };
      compensationRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      compensationRow.getCell(12).numFmt = "#,##0.00";
      compensationRow.getCell(12).font = { bold: true, color: { argb: "FF0F766E" } };
      compensationRow.getCell(12).alignment = { horizontal: "center", vertical: "middle" };
      compensationRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFCCFBF1" }
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF5EEAD4" } },
          bottom: { style: "thin", color: { argb: "FF5EEAD4" } },
          left: { style: "thin", color: { argb: "FF5EEAD4" } },
          right: { style: "thin", color: { argb: "FF5EEAD4" } }
        };
      });

      const fineRow = sheet.addRow({
        commission: fineAmount
      });
      sheet.mergeCells(`A${fineRow.number}:K${fineRow.number}`);
      fineRow.getCell(1).value = "مجموع الغرامات";
      fineRow.getCell(1).font = { bold: true, color: { argb: "FF9A3412" } };
      fineRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      fineRow.getCell(12).numFmt = "#,##0.00";
      fineRow.getCell(12).font = { bold: true, color: { argb: "FF9A3412" } };
      fineRow.getCell(12).alignment = { horizontal: "center", vertical: "middle" };
      fineRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFEDD5" }
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFFDBA74" } },
          bottom: { style: "thin", color: { argb: "FFFDBA74" } },
          left: { style: "thin", color: { argb: "FFFDBA74" } },
          right: { style: "thin", color: { argb: "FFFDBA74" } }
        };
      });
    }

    const dueRow = sheet.addRow({
      commission: driverInfo ? adjustedDueCommission : dueCommission
    });
    sheet.mergeCells(`A${dueRow.number}:K${dueRow.number}`);
    dueRow.getCell(1).value = driverInfo
      ? "المبلغ المترتب (عمولات − تعويضات + غرامات + خصومات)"
      : "مجموع العمولة المستحقة";
    dueRow.getCell(1).font = { bold: true, color: { argb: "FF166534" } };
    dueRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    dueRow.getCell(12).numFmt = "#,##0.00";
    dueRow.getCell(12).font = { bold: true, color: { argb: "FF166534" } };
    dueRow.getCell(12).alignment = { horizontal: "center", vertical: "middle" };
    dueRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDCFCE7" }
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FF86EFAC" } },
        bottom: { style: "thin", color: { argb: "FF86EFAC" } },
        left: { style: "thin", color: { argb: "FF86EFAC" } },
        right: { style: "thin", color: { argb: "FF86EFAC" } }
      };
    });

    const filenameBase = driverInfo?.user.fullName
      ? `تقرير-السائق-${sanitizeFileNameSegment(driverInfo.user.fullName)}-${from}-الى-${to}`
      : coordinatorInfo?.user.fullName
        ? `تقرير-المنسق-${sanitizeFileNameSegment(coordinatorInfo.user.fullName)}-${from}-الى-${to}`
        : `تقرير-الطلبات-المكتملة-${from}-الى-${to}`;

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buffer),
      filename: `${filenameBase}.xlsx`
    };
  },

  async settleOrderCommission(orderId: string, adminUserId: string, notes?: string) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          commission: {
            select: { id: true, driverId: true, paidAmount: true, remainingAmount: true }
          }
        }
      });
      if (!order) throw new AppError("الطلب غير موجود", 404);
      if (!order.commission) throw new AppError("لا توجد عمولة مرتبطة بهذا الطلب", 400);
      if (toNum(order.commission.remainingAmount) <= 0) {
        throw new AppError("تم تسديد هذه العمولة بالفعل", 400);
      }
      const amount = toNum(order.commission.remainingAmount);
      await applyCommissionPayment(tx, order.commission, amount, adminUserId, notes ?? `تسديد عمولة الطلب ${order.id}`);
      return { paidCount: 1, totalPaid: amount, driverId: order.commission.driverId };
    });
    scheduleDriverDebtWorkSync(result.driverId);
    notifyDriverCommissionPaid(result.driverId, result.totalPaid);
    return { paidCount: result.paidCount, totalPaid: result.totalPaid };
  },

  async settleFilteredCommissions(
    adminUserId: string,
    opts?: { from?: string | null; to?: string | null; driverId?: string | null; coordinatorId?: string | null; notes?: string }
  ) {
    const { baseWhere, fromUtc, toExclusive } = buildOrderRangeWhere(opts);
    const result = await prisma.$transaction(async (tx) => {
      const commissions = await tx.commission.findMany({
        where: {
          remainingAmount: { gt: 0 },
          order: {
            is: {
              ...baseWhere,
              status: OrderStatus.COMPLETED
            }
          }
        },
        select: {
          id: true,
          driverId: true,
          paidAmount: true,
          remainingAmount: true
        }
      });

      let totalPaid = 0;
      const paidByDriver = new Map<string, number>();
      const addPaid = (id: string, n: number) => {
        paidByDriver.set(id, (paidByDriver.get(id) ?? 0) + n);
      };
      for (const commission of commissions) {
        const amount = toNum(commission.remainingAmount);
        totalPaid += amount;
        addPaid(commission.driverId, amount);
        // eslint-disable-next-line no-await-in-loop
        await applyCommissionPayment(
          tx,
          commission,
          amount,
          adminUserId,
          opts?.notes ?? "تسديد جماعي للعمولات حسب الفلتر"
        );
      }

      const unpaidFines = await tx.financialTransaction.findMany({
        where: driverFineWhere({
          fromUtc,
          toExclusive,
          driverId: opts?.driverId
        }),
        select: {
          id: true,
          driverId: true,
          amount: true,
          referenceId: true,
          notes: true,
          type: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      });

      let finesTotalPaid = 0;
      for (const fine of unpaidFines) {
        // eslint-disable-next-line no-await-in-loop
        const paid = await applyFinePayment(
          tx,
          fine,
          adminUserId,
          opts?.notes ?? "تسديد جماعي للغرامات حسب الفلتر"
        );
        finesTotalPaid += paid.amount;
        addPaid(fine.driverId, paid.amount);
      }

      const unpaidDeductions = await tx.financialTransaction.findMany({
        where: driverDeductionWhere({
          fromUtc,
          toExclusive,
          driverId: opts?.driverId
        }),
        select: {
          id: true,
          driverId: true,
          amount: true,
          referenceId: true,
          notes: true,
          type: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      });

      let deductionsTotalPaid = 0;
      for (const deduction of unpaidDeductions) {
        // eslint-disable-next-line no-await-in-loop
        const paid = await applyDeductionPayment(
          tx,
          deduction,
          adminUserId,
          opts?.notes ?? "تسديد جماعي للخصومات حسب الفلتر"
        );
        deductionsTotalPaid += paid.amount;
        addPaid(deduction.driverId, paid.amount);
      }

      const unpaidExtraDebts = await tx.financialTransaction.findMany({
        where: driverExtraDebtWhere({
          fromUtc,
          toExclusive,
          driverId: opts?.driverId
        }),
        select: {
          id: true,
          driverId: true,
          amount: true,
          referenceId: true,
          notes: true,
          type: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      });

      let extraDebtsTotalPaid = 0;
      for (const debt of unpaidExtraDebts) {
        // eslint-disable-next-line no-await-in-loop
        const paid = await applyExtraDebtPayment(
          tx,
          debt,
          adminUserId,
          opts?.notes ?? "تسديد جماعي لديون السائقين حسب الفلتر"
        );
        extraDebtsTotalPaid += paid.amount;
        addPaid(debt.driverId, paid.amount);
      }

      return {
        paidCount: commissions.length,
        totalPaid,
        finesPaidCount: unpaidFines.length,
        finesTotalPaid,
        deductionsPaidCount: unpaidDeductions.length,
        deductionsTotalPaid,
        extraDebtsPaidCount: unpaidExtraDebts.length,
        extraDebtsTotalPaid,
        driverIds: [...paidByDriver.keys()],
        paidByDriver: [...paidByDriver.entries()].map(([driverId, amount]) => ({ driverId, amount }))
      };
    });
    for (const driverId of result.driverIds) {
      scheduleDriverDebtWorkSync(driverId);
    }
    for (const row of result.paidByDriver) {
      if (row.amount > 0) notifyDriverCommissionPaid(row.driverId, row.amount);
    }
    return {
      paidCount: result.paidCount,
      totalPaid: result.totalPaid,
      finesPaidCount: result.finesPaidCount,
      finesTotalPaid: result.finesTotalPaid,
      deductionsPaidCount: result.deductionsPaidCount,
      deductionsTotalPaid: result.deductionsTotalPaid,
      extraDebtsPaidCount: result.extraDebtsPaidCount,
      extraDebtsTotalPaid: result.extraDebtsTotalPaid
    };
  },

  async listDriverBalances() {
    const [paymentMode, drivers] = await Promise.all([
      getCommissionPaymentMode(),
      prisma.driver.findMany({
        where: { user: { deletedAt: null } },
        select: {
          id: true,
          userId: true,
          user: { select: { fullName: true, phone: true, isActive: true } },
          balances: { select: { remainingDebt: true }, take: 1 }
        }
      })
    ]);

    const rows = drivers
      .map((driver) => {
        const remainingDebt = toNum(driver.balances[0]?.remainingDebt ?? 0);
        return {
          driverId: driver.id,
          userId: driver.userId,
          fullName: driver.user.fullName ?? "",
          phone: driver.user.phone ?? null,
          isActive: driver.user.isActive,
          remainingDebt: remainingDebt.toFixed(2)
        };
      })
      .sort((a, b) => Number(b.remainingDebt) - Number(a.remainingDebt) || a.fullName.localeCompare(b.fullName, "ar"));

    return { paymentMode, rows };
  },

  async settleDriverBalance(driverId: string, adminUserId: string, notes?: string) {
    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        select: { id: true, user: { select: { fullName: true, phone: true } } }
      });
      if (!driver) throw new AppError("السائق غير موجود", 404);

      const balance = await tx.driverBalance.findUnique({ where: { driverId } });
      const remainingDebt = toNum(balance?.remainingDebt ?? 0);
      if (remainingDebt <= 0) {
        throw new AppError("لا يوجد مبلغ مترتب للتسديد على هذا السائق", 400);
      }

      const commissions = await tx.commission.findMany({
        where: {
          driverId,
          remainingAmount: { gt: 0 },
          order: { status: OrderStatus.COMPLETED }
        },
        select: {
          id: true,
          driverId: true,
          paidAmount: true,
          remainingAmount: true,
          order: { select: { id: true, completedAt: true, createdAt: true } }
        },
        orderBy: [{ id: "asc" }]
      });

      const unpaidFines = await tx.financialTransaction.findMany({
        where: {
          driverId,
          type: FinancialTransactionType.MANUAL_ADJUSTMENT,
          referenceId: null,
          notes: { startsWith: "غرامة سائق" }
        },
        select: {
          id: true,
          driverId: true,
          amount: true,
          referenceId: true,
          notes: true,
          type: true,
          createdAt: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      });

      const unpaidDeductions = await loadUnpaidDriverDeductions(tx, driverId);
      const unpaidExtraDebts = await loadUnpaidDriverExtraDebts(tx, driverId);

      if (
        commissions.length === 0 &&
        unpaidFines.length === 0 &&
        unpaidDeductions.length === 0 &&
        unpaidExtraDebts.length === 0
      ) {
        throw new AppError("لا توجد عمولات أو غرامات أو خصومات أو ديون غير مسددة للتسديد", 400);
      }

      const itemDates = [
        ...commissions.map((c) => c.order.completedAt ?? c.order.createdAt),
        ...unpaidFines.map((f) => f.createdAt),
        ...unpaidDeductions.map((d) => d.createdAt),
        ...unpaidExtraDebts.map((d) => d.createdAt)
      ].filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
      const periodFromDate = itemDates.length > 0 ? new Date(Math.min(...itemDates.map((d) => d.getTime()))) : new Date();
      const settledAt = new Date();

      const unusedCompensationRows = await tx.financialTransaction.findMany({
        where: {
          driverId,
          type: FinancialTransactionType.MANUAL_ADJUSTMENT,
          referenceId: null,
          notes: { startsWith: "تعويض سائق" }
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, driverId: true, amount: true, notes: true, createdAt: true, referenceId: true }
      });

      const periodCompensationRows = await tx.financialTransaction.findMany({
        where: {
          driverId,
          type: FinancialTransactionType.MANUAL_ADJUSTMENT,
          notes: { startsWith: "تعويض سائق" },
          createdAt: { gte: periodFromDate, lte: settledAt }
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, driverId: true, amount: true, notes: true, createdAt: true, referenceId: true }
      });

      const compensationById = new Map<string, (typeof unusedCompensationRows)[number]>();
      for (const row of [...unusedCompensationRows, ...periodCompensationRows]) {
        compensationById.set(row.id, row);
      }
      const compensationRows = [...compensationById.values()].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
      );

      const invoicePeriodDates = [
        ...itemDates,
        ...compensationRows.map((row) => row.createdAt)
      ];
      const invoicePeriodFrom =
        invoicePeriodDates.length > 0 ? new Date(Math.min(...invoicePeriodDates.map((d) => d.getTime()))) : periodFromDate;

      const invoiceCommissions = commissions.map((row) => ({
        orderId: row.order.id,
        completedAt: (row.order.completedAt ?? row.order.createdAt).toISOString(),
        amount: toNum(row.remainingAmount).toFixed(2)
      }));
      const invoiceFines = unpaidFines.map((row) => ({
        id: row.id,
        reason: parseFineReason(row.notes),
        createdAt: row.createdAt.toISOString(),
        amount: toNum(row.amount).toFixed(2)
      }));
      const invoiceCompensations = compensationRows.map((row) => ({
        id: row.id,
        reason: parseCompensationReason(row.notes),
        createdAt: row.createdAt.toISOString(),
        amount: toNum(row.amount).toFixed(2)
      }));

      let totalPaid = 0;
      for (const commission of commissions) {
        const amount = toNum(commission.remainingAmount);
        totalPaid += amount;
        // eslint-disable-next-line no-await-in-loop
        await applyCommissionPayment(
          tx,
          commission,
          amount,
          adminUserId,
          notes ?? `تسديد عمولات السائق ${driver.user.fullName}`
        );
      }

      let finesTotalPaid = 0;
      for (const fine of unpaidFines) {
        // eslint-disable-next-line no-await-in-loop
        const paid = await applyFinePayment(
          tx,
          fine,
          adminUserId,
          notes ?? `تسديد غرامات السائق ${driver.user.fullName}`
        );
        finesTotalPaid += paid.amount;
      }

      let deductionsTotalPaid = 0;
      for (const deduction of unpaidDeductions) {
        // eslint-disable-next-line no-await-in-loop
        const paid = await applyDeductionPayment(
          tx,
          deduction,
          adminUserId,
          notes ?? `تسديد خصومات السائق ${driver.user.fullName}`
        );
        deductionsTotalPaid += paid.amount;
      }

      let extraDebtsTotalPaid = 0;
      for (const extraDebt of unpaidExtraDebts) {
        // eslint-disable-next-line no-await-in-loop
        const paid = await applyExtraDebtPayment(
          tx,
          extraDebt,
          adminUserId,
          notes ?? `تسديد ديون السائق ${driver.user.fullName}`
        );
        extraDebtsTotalPaid += paid.amount;
      }

      for (const compensation of unusedCompensationRows) {
        // eslint-disable-next-line no-await-in-loop
        await consumeCompensationOnSettlement(
          tx,
          compensation,
          adminUserId,
          notes ?? `استهلاك تعويض السائق ${driver.user.fullName} عند التسديد`
        );
      }

      await tx.driverBalance.update({
        where: { driverId },
        data: { remainingDebt: new Prisma.Decimal("0.00") }
      });

      const compensationAmount = compensationRows.reduce((sum, row) => sum + toNum(row.amount), 0);

      return {
        driverId,
        paidCount: commissions.length,
        totalPaid,
        finesPaidCount: unpaidFines.length,
        finesTotalPaid,
        deductionsPaidCount: unpaidDeductions.length,
        deductionsTotalPaid,
        extraDebtsPaidCount: unpaidExtraDebts.length,
        extraDebtsTotalPaid,
        remainingDebt: "0.00",
        invoice: {
          driverId,
          driverName: driver.user.fullName ?? "",
          driverPhone: driver.user.phone ?? null,
          settledAt: settledAt.toISOString(),
          periodFrom: toSyriaYmd(invoicePeriodFrom),
          periodTo: toSyriaYmd(settledAt),
          commissions: invoiceCommissions,
          fines: invoiceFines,
          compensations: invoiceCompensations,
          totals: {
            commissionAmount: totalPaid.toFixed(2),
            fineAmount: finesTotalPaid.toFixed(2),
            compensationAmount: compensationAmount.toFixed(2),
            netAmount: remainingDebt.toFixed(2)
          }
        }
      };
    });
    scheduleDriverDebtWorkSync(driverId);
    const settledNet = Number(result.invoice.totals.netAmount);
    if (settledNet > 0) notifyDriverCommissionPaid(driverId, settledNet);
    return result;
  },

  async payoutDriverCredit(driverId: string, adminUserId: string, notes?: string) {
    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        select: { id: true, user: { select: { fullName: true } } }
      });
      if (!driver) throw new AppError("السائق غير موجود", 404);

      const balance =
        (await tx.driverBalance.findUnique({ where: { driverId } })) ??
        (await tx.driverBalance.create({ data: { driverId } }));
      const remainingDebt = toNum(balance.remainingDebt);
      if (!(remainingDebt < 0)) {
        throw new AppError("لا يوجد مبلغ مستحق لتقبيضه لهذا السائق", 400);
      }

      const credit = Math.round(-remainingDebt * 100) / 100;
      const payoutNote = notes?.trim()
        ? `تقبيض مستحق سائق: ${notes.trim()}`
        : `تقبيض مستحق السائق ${driver.user.fullName}`;

      const consumed = await consumeUnusedCompensationsUpTo(tx, driverId, credit, adminUserId, payoutNote);
      if (!(consumed > 0)) {
        throw new AppError("لا يوجد مبلغ مضاف لهذا السائق لتقبيضه. الرصيد المسبق لا يُقبَّض من هنا.", 400);
      }

      await tx.financialTransaction.create({
        data: {
          driverId,
          type: FinancialTransactionType.MANUAL_ADJUSTMENT,
          amount: new Prisma.Decimal(consumed.toFixed(2)),
          notes: payoutNote,
          createdByUserId: adminUserId
        }
      });

      const nextDebt = Math.round((remainingDebt + consumed) * 100) / 100;
      await tx.driverBalance.update({
        where: { driverId },
        data: { remainingDebt: new Prisma.Decimal(nextDebt.toFixed(2)) }
      });

      return { driverId, amount: consumed, remainingDebt: nextDebt.toFixed(2) };
    });
    scheduleDriverDebtWorkSync(driverId);
    notifyDriverCreditPayout(driverId, result.amount);
    return result;
  },

  async previewPaymentModeSwitch() {
    const drivers = await prisma.driver.findMany({
      where: { user: { deletedAt: null } },
      select: {
        id: true,
        user: { select: { fullName: true } },
        balances: { select: { remainingDebt: true }, take: 1 }
      }
    });

    let nonzeroDriverCount = 0;
    let totalDebt = 0;
    let totalPrepaidCredit = 0;
    let unusedCompensationTotal = 0;
    let unpaidCommissionTotal = 0;
    let unpaidFinesTotal = 0;

    for (const driver of drivers) {
      const remainingDebt = toNum(driver.balances[0]?.remainingDebt ?? 0);
      const [unused, commissions, fines] = await Promise.all([
        loadUnusedDriverCompensations(prisma, driver.id),
        loadUnpaidDriverCommissions(prisma, driver.id),
        loadUnpaidDriverFines(prisma, driver.id)
      ]);
      const unusedCompensation = unused.reduce((sum, row) => sum + toNum(row.amount), 0);
      const unpaidCommission = commissions.reduce((sum, row) => sum + toNum(row.remainingAmount), 0);
      const unpaidFines = fines.reduce((sum, row) => sum + toNum(row.amount), 0);
      unusedCompensationTotal += unusedCompensation;
      unpaidCommissionTotal += unpaidCommission;
      unpaidFinesTotal += unpaidFines;
      if (remainingDebt > 0) totalDebt += remainingDebt;
      if (remainingDebt < 0) totalPrepaidCredit += -remainingDebt;
      if (!moneyEqZero(remainingDebt)) nonzeroDriverCount += 1;
    }

    return {
      needsZeroing: nonzeroDriverCount > 0,
      nonzeroDriverCount,
      driverCount: drivers.length,
      totalDebt: totalDebt.toFixed(2),
      totalPrepaidCredit: totalPrepaidCredit.toFixed(2),
      unusedCompensationTotal: unusedCompensationTotal.toFixed(2),
      unpaidCommissionTotal: unpaidCommissionTotal.toFixed(2),
      unpaidFinesTotal: unpaidFinesTotal.toFixed(2),
      message: "سيتم تصفير جميع أرصدة السائقين مع تخزين جميع المستحقات والديون"
    };
  },

  async archiveAndZeroDriverBalancesForModeSwitch(opts: {
    fromMode: "POSTPAID" | "PREPAID";
    toMode: "POSTPAID" | "PREPAID";
    adminUserId: string;
  }) {
    const notes = `تصفير الأرصدة عند التحويل من ${opts.fromMode === "PREPAID" ? "مسبق الدفع" : "ملحق الدفع"} إلى ${opts.toMode === "PREPAID" ? "مسبق الدفع" : "ملحق الدفع"}`;
    const result = await prisma.$transaction(async (tx) => {
      const drivers = await tx.driver.findMany({
        where: { user: { deletedAt: null } },
        select: {
          id: true,
          user: { select: { fullName: true } },
          balances: { select: { remainingDebt: true }, take: 1 }
        }
      });

      const driverIds: string[] = [];
      let itemCount = 0;
      let settlementId: string | null = null;

      for (const driver of drivers) {
        const remainingDebt = toNum(driver.balances[0]?.remainingDebt ?? 0);
        const unused = await loadUnusedDriverCompensations(tx, driver.id);
        const commissions = await loadUnpaidDriverCommissions(tx, driver.id);
        const fines = await loadUnpaidDriverFines(tx, driver.id);
        const deductions = await loadUnpaidDriverDeductions(tx, driver.id);
        const extraDebts = await loadUnpaidDriverExtraDebts(tx, driver.id);
        const unusedCompensation = unused.reduce((sum, row) => sum + toNum(row.amount), 0);
        const unpaidCommission = commissions.reduce((sum, row) => sum + toNum(row.remainingAmount), 0);
        const unpaidFines = fines.reduce((sum, row) => sum + toNum(row.amount), 0);
        const unpaidDeductions = deductions.reduce((sum, row) => sum + toNum(row.amount), 0);
        const unpaidExtraDebt = extraDebts.reduce((sum, row) => sum + toNum(row.amount), 0);
        const hasSnapshot =
          !moneyEqZero(remainingDebt) ||
          unusedCompensation > 0 ||
          unpaidCommission > 0 ||
          unpaidFines > 0 ||
          unpaidDeductions > 0 ||
          unpaidExtraDebt > 0;

        if (hasSnapshot) {
          if (!settlementId) {
            const settlement = await tx.paymentModeSettlement.create({
              data: {
                fromMode: opts.fromMode,
                toMode: opts.toMode,
                createdByUserId: opts.adminUserId,
                notes
              }
            });
            settlementId = settlement.id;
          }
          await tx.paymentModeSettlementItem.create({
            data: {
              settlementId,
              driverId: driver.id,
              driverName: driver.user.fullName?.trim() || "—",
              remainingDebt: new Prisma.Decimal(remainingDebt.toFixed(2)),
              unusedCompensation: new Prisma.Decimal(unusedCompensation.toFixed(2)),
              unpaidCommission: new Prisma.Decimal(unpaidCommission.toFixed(2)),
              unpaidFines: new Prisma.Decimal(unpaidFines.toFixed(2))
            }
          });
          itemCount += 1;
        }

        for (const commission of commissions) {
          const amount = toNum(commission.remainingAmount);
          if (amount > 0) {
            await applyCommissionPayment(tx, commission, amount, opts.adminUserId, notes);
          }
        }
        for (const fine of fines) {
          await applyFinePayment(tx, fine, opts.adminUserId, notes);
        }
        for (const deduction of deductions) {
          await applyDeductionPayment(tx, deduction, opts.adminUserId, notes);
        }
        for (const extraDebt of extraDebts) {
          await applyExtraDebtPayment(tx, extraDebt, opts.adminUserId, notes);
        }
        for (const compensation of unused) {
          await consumeCompensationOnSettlement(tx, compensation, opts.adminUserId, notes);
        }

        const balance = await tx.driverBalance.findUnique({ where: { driverId: driver.id } });
        if (balance) {
          await tx.driverBalance.update({
            where: { driverId: driver.id },
            data: { remainingDebt: new Prisma.Decimal("0.00") }
          });
        } else if (!moneyEqZero(remainingDebt)) {
          await tx.driverBalance.create({
            data: { driverId: driver.id, remainingDebt: new Prisma.Decimal("0.00") }
          });
        }
        driverIds.push(driver.id);
      }

      return { settlementId, itemCount, driverIds };
    });

    for (const driverId of result.driverIds) {
      scheduleDriverDebtWorkSync(driverId);
    }
    return result;
  },

  async recordPrepaidTopup(driverId: string, amount: number, adminUserId: string, notes?: string) {
    const mode = await getCommissionPaymentMode();
    if (mode !== "PREPAID") {
      throw new AppError("شحن الرصيد متاح في وضع مسبق الدفع فقط", 400);
    }
    if (!(amount > 0) || amount > 99_999_999.99) {
      throw new AppError("مبلغ الشحن يجب أن يكون رقمًا صالحًا أكبر من صفر", 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        select: { id: true }
      });
      if (!driver) throw new AppError("السائق غير موجود", 404);

      const currentBalance =
        (await tx.driverBalance.findUnique({ where: { driverId } })) ??
        (await tx.driverBalance.create({ data: { driverId } }));

      const nextDebt = roundMoney(toNum(currentBalance.remainingDebt) - amount);
      await tx.financialTransaction.create({
        data: {
          driverId,
          type: FinancialTransactionType.PREPAID_TOPUP,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          notes: notes?.trim() ? `شحن رصيد مسبق: ${notes.trim()}` : "شحن رصيد مسبق",
          createdByUserId: adminUserId
        }
      });

      await tx.driverBalance.update({
        where: { driverId },
        data: {
          remainingDebt: new Prisma.Decimal(nextDebt.toFixed(2)),
          availableBalance: new Prisma.Decimal((toNum(currentBalance.availableBalance) + amount).toFixed(2))
        }
      });
      await settleDriverCoveredLedgers(tx, driverId, nextDebt, adminUserId);

      return {
        driverId,
        amount: amount.toFixed(2),
        remainingDebt: nextDebt.toFixed(2),
        prepaidCredit: (nextDebt < 0 ? -nextDebt : 0).toFixed(2)
      };
    });
    scheduleDriverDebtWorkSync(driverId, "topup");
    notifyDriverPrepaidTopup(driverId, amount);
    return result;
  },

  async listPaymentModeSettlements() {
    const [paymentMode, drivers, archives] = await Promise.all([
      getCommissionPaymentMode(),
      prisma.driver.findMany({
        where: { user: { deletedAt: null } },
        select: {
          id: true,
          userId: true,
          user: { select: { fullName: true, phone: true, isActive: true } },
          balances: { select: { remainingDebt: true }, take: 1 }
        }
      }),
      prisma.paymentModeSettlement.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            orderBy: { driverName: "asc" }
          }
        }
      })
    ]);

    const driverIds = drivers.map((driver) => driver.id);
    const adjustmentBase = {
      driverId: { in: driverIds },
      type: FinancialTransactionType.MANUAL_ADJUSTMENT,
      referenceId: null
    } as const;

    const [compensationGroups, extraDebtGroups, fineGroups, deductionGroups, commissionGroups] =
      driverIds.length === 0
        ? [[], [], [], [], []]
        : await Promise.all([
            prisma.financialTransaction.groupBy({
              by: ["driverId"],
              where: { ...adjustmentBase, notes: { startsWith: "تعويض سائق" } },
              _sum: { amount: true }
            }),
            prisma.financialTransaction.groupBy({
              by: ["driverId"],
              where: { ...adjustmentBase, notes: { startsWith: "دين سائق" } },
              _sum: { amount: true }
            }),
            prisma.financialTransaction.groupBy({
              by: ["driverId"],
              where: { ...adjustmentBase, notes: { startsWith: "غرامة سائق" } },
              _sum: { amount: true }
            }),
            prisma.financialTransaction.groupBy({
              by: ["driverId"],
              where: { ...adjustmentBase, notes: { startsWith: "خصم سائق" } },
              _sum: { amount: true }
            }),
            prisma.commission.groupBy({
              by: ["driverId"],
              where: {
                driverId: { in: driverIds },
                remainingAmount: { gt: 0 },
                order: { status: OrderStatus.COMPLETED }
              },
              _sum: { remainingAmount: true }
            })
          ]);

    const toMap = (rows: Array<{ driverId: string; _sum: { amount?: Prisma.Decimal | null; remainingAmount?: Prisma.Decimal | null } }>, key: "amount" | "remainingAmount") => {
      const map = new Map<string, number>();
      for (const row of rows) {
        map.set(row.driverId, toNum((row._sum[key] as Prisma.Decimal | null | undefined) ?? 0));
      }
      return map;
    };

    const unusedCompensationByDriver = toMap(compensationGroups, "amount");
    const extraDebtByDriver = toMap(extraDebtGroups, "amount");
    const unpaidFineByDriver = toMap(fineGroups, "amount");
    const unpaidDeductionByDriver = toMap(deductionGroups, "amount");
    const unpaidCommissionByDriver = toMap(commissionGroups, "remainingAmount");

    const rows = drivers
      .map((driver) => {
        const remainingDebt = toNum(driver.balances[0]?.remainingDebt ?? 0);
        const kind = (remainingDebt > 0 ? "debt" : remainingDebt < 0 ? "credit" : "zero") as
          | "debt"
          | "credit"
          | "zero";
        return {
          driverId: driver.id,
          userId: driver.userId,
          fullName: driver.user.fullName ?? "",
          phone: driver.user.phone ?? null,
          isActive: driver.user.isActive,
          remainingDebt: remainingDebt.toFixed(2),
          unusedCompensation: (unusedCompensationByDriver.get(driver.id) ?? 0).toFixed(2),
          unpaidCommission: (unpaidCommissionByDriver.get(driver.id) ?? 0).toFixed(2),
          unpaidFines: (unpaidFineByDriver.get(driver.id) ?? 0).toFixed(2),
          unpaidDeductions: (unpaidDeductionByDriver.get(driver.id) ?? 0).toFixed(2),
          extraDebt: (extraDebtByDriver.get(driver.id) ?? 0).toFixed(2),
          kind
        };
      })
      .sort((a, b) => {
        const order = { debt: 0, credit: 1, zero: 2 } as const;
        const kindDiff = order[a.kind] - order[b.kind];
        if (kindDiff !== 0) return kindDiff;
        return Math.abs(Number(b.remainingDebt)) - Math.abs(Number(a.remainingDebt)) || a.fullName.localeCompare(b.fullName, "ar");
      });

    const debtRows = rows.filter((row) => row.kind === "debt");
    const creditRows = rows.filter((row) => row.kind === "credit");
    const totalDebt = debtRows.reduce((sum, row) => sum + Number(row.remainingDebt), 0);
    const totalCredit = creditRows.reduce((sum, row) => sum + Math.abs(Number(row.remainingDebt)), 0);

    return {
      paymentMode,
      summary: {
        driverCount: rows.length,
        debtDriverCount: debtRows.length,
        creditDriverCount: creditRows.length,
        zeroDriverCount: rows.length - debtRows.length - creditRows.length,
        totalDebt: totalDebt.toFixed(2),
        totalCredit: totalCredit.toFixed(2)
      },
      rows,
      archives: archives.map((row) => ({
        id: row.id,
        fromMode: row.fromMode,
        toMode: row.toMode,
        createdByUserId: row.createdByUserId,
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
        items: row.items.map((item) => ({
          id: item.id,
          driverId: item.driverId,
          driverName: item.driverName,
          remainingDebt: toNum(item.remainingDebt).toFixed(2),
          unusedCompensation: toNum(item.unusedCompensation).toFixed(2),
          unpaidCommission: toNum(item.unpaidCommission).toFixed(2),
          unpaidFines: toNum(item.unpaidFines).toFixed(2)
        }))
      }))
    };
  },

  async buildDebtsDuesExportXlsx() {
    const data = await this.listPaymentModeSettlements();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Taxi Office Admin";
    workbook.created = new Date();
    workbook.modified = new Date();

    const current = workbook.addWorksheet("الديون والمستحقات", {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 5 }]
    });
    current.columns = [
      { header: "السائق", key: "fullName", width: 24 },
      { header: "الهاتف", key: "phone", width: 16 },
      { header: "الحالة", key: "status", width: 16 },
      { header: "المبلغ", key: "amount", width: 16 },
      { header: "النوع", key: "kind", width: 14 },
      { header: "عمولات غير مسددة", key: "unpaidCommission", width: 18 },
      { header: "غرامات غير مسددة", key: "unpaidFines", width: 18 },
      { header: "خصومات غير مسددة", key: "unpaidDeductions", width: 18 },
      { header: "ديون إضافية", key: "extraDebt", width: 16 },
      { header: "تعويض غير مستفاد", key: "unusedCompensation", width: 18 },
      { header: "الحساب", key: "isActive", width: 12 }
    ];

    current.mergeCells("A1:K1");
    current.getCell("A1").value = "تقرير الديون والمستحقات";
    current.getCell("A1").font = { bold: true, size: 16 };
    current.mergeCells("A2:K2");
    current.getCell("A2").value =
      data.paymentMode === "PREPAID" ? "وضع العمل: مسبق الدفع" : "وضع العمل: ملحق الدفع";
    current.mergeCells("A3:K3");
    current.getCell("A3").value =
      `ديون ${data.summary.totalDebt} ل.س (${data.summary.debtDriverCount} سائق) · مستحقات ${data.summary.totalCredit} ل.س (${data.summary.creditDriverCount} سائق)`;
    current.getRow(5).values = current.columns.map((col) =>
      typeof col.header === "string" ? col.header : ""
    );
    current.getRow(5).font = { bold: true };

    for (const row of data.rows) {
      const remaining = Number(row.remainingDebt);
      current.addRow({
        fullName: row.fullName,
        phone: row.phone ?? "—",
        status: remaining > 0 ? "دين على السائق" : remaining < 0 ? "مستحق للسائق" : "رصيد صفري",
        amount: Math.abs(remaining),
        kind: remaining > 0 ? "دين" : remaining < 0 ? "مستحق" : "صفر",
        unpaidCommission: Number(row.unpaidCommission),
        unpaidFines: Number(row.unpaidFines),
        unpaidDeductions: Number(row.unpaidDeductions),
        extraDebt: Number(row.extraDebt),
        unusedCompensation: Number(row.unusedCompensation),
        isActive: row.isActive ? "نشط" : "معطل"
      });
    }

    if (data.archives.length > 0) {
      const archive = workbook.addWorksheet("أرشيف تبديل الوضع", {
        views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }]
      });
      archive.columns = [
        { header: "تاريخ التحويل", key: "createdAt", width: 22 },
        { header: "من", key: "fromMode", width: 14 },
        { header: "إلى", key: "toMode", width: 14 },
        { header: "السائق", key: "driverName", width: 24 },
        { header: "الدين / المستحق", key: "remainingDebt", width: 16 },
        { header: "تعويض غير مستفاد", key: "unusedCompensation", width: 18 },
        { header: "عمولات غير مسددة", key: "unpaidCommission", width: 18 },
        { header: "غرامات غير مسددة", key: "unpaidFines", width: 18 }
      ];
      archive.getRow(1).font = { bold: true };
      const modeLabel = (mode: "POSTPAID" | "PREPAID") => (mode === "PREPAID" ? "مسبق الدفع" : "ملحق الدفع");
      for (const settlement of data.archives) {
        for (const item of settlement.items) {
          archive.addRow({
            createdAt: new Date(settlement.createdAt),
            fromMode: modeLabel(settlement.fromMode),
            toMode: modeLabel(settlement.toMode),
            driverName: item.driverName,
            remainingDebt: Number(item.remainingDebt),
            unusedCompensation: Number(item.unusedCompensation),
            unpaidCommission: Number(item.unpaidCommission),
            unpaidFines: Number(item.unpaidFines)
          });
        }
      }
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const stamp = todaySyriaYmd().replace(/-/g, "");
    return {
      filename: `ديون-ومستحقات-${stamp}.xlsx`,
      buffer
    };
  }
};
