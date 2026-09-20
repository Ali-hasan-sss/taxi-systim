import { CommissionPaymentStatus, FinancialTransactionType, OrderStatus, Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { scheduleDriverDebtWorkSync } from "../../shared/driver-debt-block";
import { notifyDriverCommissionPaid, notifyDriverCompensation, notifyDriverFine } from "../../shared/driver-notifications";

const toNum = (d: Prisma.Decimal | number) => Number(d);
const FINANCE_REPORT_PAGE_DEFAULT = 25;
const FINANCE_REPORT_PAGE_MAX = 100;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type FinanceCommissionShape = {
  id: string;
  driverId: string;
  paidAmount: Prisma.Decimal;
  remainingAmount: Prisma.Decimal;
};

type PrismaTx = Prisma.TransactionClient;

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
  const amount = opts.amount;
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

  await tx.driverBalance.update({
    where: { driverId: opts.driverId },
    data: {
      remainingDebt: new Prisma.Decimal((toNum(currentBalance.remainingDebt) + amount).toFixed(2)),
      availableBalance: new Prisma.Decimal(Math.max(0, toNum(currentBalance.availableBalance) - amount).toFixed(2))
    }
  });

  return { driverId: opts.driverId, amount };
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
  adminUserId: string,
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
      createdByUserId: adminUserId
    }
  });

  await tx.financialTransaction.update({
    where: { id: compensation.id },
    data: { referenceId: consume.id }
  });
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

      await tx.driverBalance.update({
        where: { driverId },
        data: {
          remainingDebt: new Prisma.Decimal((toNum(currentBalance.remainingDebt) - amount).toFixed(2)),
          availableBalance: new Prisma.Decimal((toNum(currentBalance.availableBalance) + amount).toFixed(2))
        }
      });

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

    const [rows, aggregate, unpaidAggregate] = await Promise.all([
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
    const cancelReasons = await resolveCancelFineReasons(rows);

    return {
      driver,
      from: from ?? null,
      to: to ?? null,
      totalAmount: toNum(aggregate._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      count: aggregate._count._all,
      unpaidAmount: toNum(unpaidAggregate._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      unpaidCount: unpaidAggregate._count._all,
      rows: rows.map((row, index) => ({
        id: row.id,
        amount: row.amount.toString(),
        reason: cancelReasons.get(index) ?? parseFineReason(row.notes),
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
        createdByName: row.createdByUserId ? creatorById.get(row.createdByUserId) ?? null : null,
        driverId: row.driverId,
        driverName: row.driver?.user.fullName ?? "—",
        isPaid: row.referenceId != null
      }))
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

    return {
      driver,
      from: from ?? null,
      to: to ?? null,
      totalAmount: toNum(aggregate._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      count: aggregate._count._all,
      unusedAmount: toNum(unusedAggregate._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      unusedCount: unusedAggregate._count._all,
      rows: rows.map((row) => {
        const source = compensationSource(row.notes);
        const usage = compensationUsage(row.notes, row.referenceId);
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
          isUsed: usage.isUsed,
          status: usage.status,
          statusLabel: usage.statusLabel
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

    const [
      completedOrdersAggregate,
      totalCommissionAggregate,
      dueCommissionAggregate,
      compensationAggregate,
      fineAggregate,
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
    const adjustedDueCommissionAmount = Math.max(0, dueCommissionAmount - compensationAmount + fineAmount);

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
    const adjustedDueCommission = Math.max(0, dueCommission - compensationAmount + fineAmount);

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
      ? "المبلغ المترتب (عمولات − تعويضات + غرامات)"
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

      return {
        paidCount: commissions.length,
        totalPaid,
        finesPaidCount: unpaidFines.length,
        finesTotalPaid,
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
      finesTotalPaid: result.finesTotalPaid
    };
  },

  async listDriverBalances() {
    const drivers = await prisma.driver.findMany({
      select: {
        id: true,
        userId: true,
        user: { select: { fullName: true, phone: true, isActive: true } },
        balances: { select: { remainingDebt: true }, take: 1 }
      }
    });

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

    return { rows };
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

      if (commissions.length === 0 && unpaidFines.length === 0) {
        throw new AppError("لا توجد عمولات أو غرامات غير مسددة للتسديد", 400);
      }

      const itemDates = [
        ...commissions.map((c) => c.order.completedAt ?? c.order.createdAt),
        ...unpaidFines.map((f) => f.createdAt)
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
  }
};
