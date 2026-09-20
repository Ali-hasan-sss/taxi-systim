import type { Server } from "socket.io";
import { FinancialTransactionType, OrderStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { syriaCalendarDayIso } from "../../shared/syria-time";
import { getConnectedOnlineDriverIds } from "../../socket";

const ACTIVE_TRIP_STATUSES: OrderStatus[] = [
  OrderStatus.ACCEPTED,
  OrderStatus.ARRIVED,
  OrderStatus.EN_ROUTE_TO_CUSTOMER,
  OrderStatus.STARTED,
  OrderStatus.STUCK
];

function syriaDayUtcRange(ymd: string): { from: Date; toExclusive: Date } {
  const [year, month, day] = ymd.split("-").map(Number);
  const fromParts = { year, month, day };
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  const nextYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(next);
  const [ny, nm, nd] = nextYmd.split("-").map(Number);

  const zonedStart = zonedToUtc(fromParts.year, fromParts.month, fromParts.day, 0, 0, 0);
  const zonedEnd = zonedToUtc(ny, nm, nd, 0, 0, 0);
  return { from: zonedStart, toExclusive: zonedEnd };
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

function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number): Date {
  let utcTs = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  for (let i = 0; i < 2; i += 1) {
    const offsetMs = getTimeZoneOffsetMs("Asia/Damascus", new Date(utcTs));
    utcTs = Date.UTC(year, month - 1, day, hour, minute, second, 0) - offsetMs;
  }
  return new Date(utcTs);
}

function toNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number): string {
  return value.toFixed(2);
}

function addCalendarDaysYmd(ymd: string, delta: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + delta, 12, 0, 0);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(utc));
}

function listYmdRange(fromYmd: string, toYmdInclusive: string): string[] {
  const days: string[] = [];
  let cursor = fromYmd;
  for (let i = 0; i < 62; i += 1) {
    days.push(cursor);
    if (cursor === toYmdInclusive) break;
    cursor = addCalendarDaysYmd(cursor, 1);
  }
  return days;
}

function emptyRevenue() {
  return { commissions: 0, fines: 0, compensations: 0, revenue: 0 };
}

function withRevenue(parts: { commissions: number; fines: number; compensations: number }) {
  return {
    ...parts,
    revenue: parts.commissions + parts.fines - parts.compensations
  };
}

function serializeRevenue(parts: { commissions: number; fines: number; compensations: number; revenue: number }) {
  return {
    commissions: money(parts.commissions),
    fines: money(parts.fines),
    compensations: money(parts.compensations),
    revenue: money(parts.revenue)
  };
}

/** صف التعويض الأصلي فقط (استهلاك التسديد ملاحظته مختلفة فلا يُحسب مرتين). */
function compensationGrantWhere(from: Date, toExclusive: Date): Prisma.FinancialTransactionWhereInput {
  return {
    type: FinancialTransactionType.MANUAL_ADJUSTMENT,
    notes: { startsWith: "تعويض سائق" },
    createdAt: { gte: from, lt: toExclusive }
  };
}

function fineGrantWhere(from: Date, toExclusive: Date): Prisma.FinancialTransactionWhereInput {
  return {
    type: FinancialTransactionType.MANUAL_ADJUSTMENT,
    notes: { startsWith: "غرامة سائق" },
    createdAt: { gte: from, lt: toExclusive }
  };
}

async function sumRevenueInRange(from: Date, toExclusive: Date) {
  const [commissionAgg, fineAgg, compensationAgg] = await Promise.all([
    prisma.commission.aggregate({
      where: {
        order: {
          is: {
            status: OrderStatus.COMPLETED,
            completedAt: { gte: from, lt: toExclusive }
          }
        }
      },
      _sum: { calculatedCommission: true }
    }),
    prisma.financialTransaction.aggregate({
      where: fineGrantWhere(from, toExclusive),
      _sum: { amount: true }
    }),
    prisma.financialTransaction.aggregate({
      where: compensationGrantWhere(from, toExclusive),
      _sum: { amount: true }
    })
  ]);

  return withRevenue({
    commissions: toNum(commissionAgg._sum.calculatedCommission),
    fines: toNum(fineAgg._sum.amount),
    compensations: toNum(compensationAgg._sum.amount)
  });
}

async function dailyRevenueSeries(fromYmd: string, toYmdInclusive: string) {
  const { from } = syriaDayUtcRange(fromYmd);
  const { toExclusive } = syriaDayUtcRange(toYmdInclusive);
  const days = listYmdRange(fromYmd, toYmdInclusive);
  const buckets = new Map(days.map((ymd) => [ymd, emptyRevenue()]));

  const [commissions, fines, compensations] = await Promise.all([
    prisma.commission.findMany({
      where: {
        order: {
          is: {
            status: OrderStatus.COMPLETED,
            completedAt: { gte: from, lt: toExclusive }
          }
        }
      },
      select: {
        id: true,
        calculatedCommission: true,
        order: { select: { completedAt: true } }
      }
    }),
    prisma.financialTransaction.findMany({
      where: fineGrantWhere(from, toExclusive),
      select: { id: true, amount: true, createdAt: true }
    }),
    prisma.financialTransaction.findMany({
      where: compensationGrantWhere(from, toExclusive),
      select: { id: true, amount: true, createdAt: true }
    })
  ]);

  const seenCompensationIds = new Set<string>();

  for (const row of commissions) {
    const at = row.order.completedAt;
    if (!at) continue;
    const ymd = syriaCalendarDayIso(at);
    const bucket = buckets.get(ymd);
    if (!bucket) continue;
    bucket.commissions += toNum(row.calculatedCommission);
  }

  for (const row of fines) {
    const ymd = syriaCalendarDayIso(row.createdAt);
    const bucket = buckets.get(ymd);
    if (!bucket) continue;
    bucket.fines += toNum(row.amount);
  }

  for (const row of compensations) {
    if (seenCompensationIds.has(row.id)) continue;
    seenCompensationIds.add(row.id);
    const ymd = syriaCalendarDayIso(row.createdAt);
    const bucket = buckets.get(ymd);
    if (!bucket) continue;
    bucket.compensations += toNum(row.amount);
  }

  return days.map((date) => {
    const parts = withRevenue(buckets.get(date) ?? emptyRevenue());
    return { date, ...serializeRevenue(parts) };
  });
}

export const adminService = {
  async dashboardStats(io?: Server) {
    const today = syriaCalendarDayIso();
    const monthStart = `${today.slice(0, 7)}-01`;
    const weekStart = addCalendarDaysYmd(today, -6);
    const { from: todayFrom, toExclusive: todayToExclusive } = syriaDayUtcRange(today);
    const monthFrom = syriaDayUtcRange(monthStart).from;
    const completedTodayWhere = {
      status: OrderStatus.COMPLETED,
      completedAt: { gte: todayFrom, lt: todayToExclusive }
    };

    const [
      todayRevenue,
      monthRevenue,
      weekSeries,
      dueCommissionAgg,
      unpaidFineAgg,
      unusedCompensationAgg,
      completedTodayCount,
      activeTrips,
      totalDrivers,
      employeesByRole,
      connectedIds
    ] = await Promise.all([
      sumRevenueInRange(todayFrom, todayToExclusive),
      sumRevenueInRange(monthFrom, todayToExclusive),
      dailyRevenueSeries(weekStart, today),
      prisma.commission.aggregate({
        where: {
          order: { status: OrderStatus.COMPLETED },
          remainingAmount: { gt: 0 }
        },
        _sum: { remainingAmount: true }
      }),
      prisma.financialTransaction.aggregate({
        where: {
          type: FinancialTransactionType.MANUAL_ADJUSTMENT,
          referenceId: null,
          notes: { startsWith: "غرامة سائق" }
        },
        _sum: { amount: true }
      }),
      prisma.financialTransaction.aggregate({
        where: {
          type: FinancialTransactionType.MANUAL_ADJUSTMENT,
          referenceId: null,
          notes: { startsWith: "تعويض سائق" }
        },
        _sum: { amount: true }
      }),
      prisma.order.count({ where: completedTodayWhere }),
      prisma.order.count({ where: { status: { in: ACTIVE_TRIP_STATUSES } } }),
      prisma.driver.count({ where: { user: { role: Role.DRIVER, isActive: true } } }),
      prisma.user.groupBy({
        by: ["role"],
        where: { isActive: true },
        _count: { _all: true }
      }),
      io ? getConnectedOnlineDriverIds(io) : Promise.resolve([] as string[])
    ]);

    let activeDriversOnline = 0;
    if (connectedIds.length > 0) {
      activeDriversOnline = await prisma.driver.count({
        where: {
          id: { in: connectedIds },
          user: { role: Role.DRIVER, isActive: true }
        }
      });
    }

    const roleCounts = {
      admin: 0,
      coordinator: 0,
      driver: 0
    };
    for (const row of employeesByRole) {
      if (row.role === Role.ADMIN) roleCounts.admin = row._count._all;
      if (row.role === Role.COORDINATOR) roleCounts.coordinator = row._count._all;
      if (row.role === Role.DRIVER) roleCounts.driver = row._count._all;
    }

    const employeesTotal = roleCounts.admin + roleCounts.coordinator + roleCounts.driver;
    const dueCommissionRaw = toNum(dueCommissionAgg._sum.remainingAmount);
    const unpaidFines = toNum(unpaidFineAgg._sum.amount);
    const unusedCompensations = toNum(unusedCompensationAgg._sum.amount);
    const dueCommission = dueCommissionRaw - unusedCompensations + unpaidFines;

    return {
      today,
      month: today.slice(0, 7),
      weekStart,
      revenueToday: money(todayRevenue.revenue),
      commissionToday: money(todayRevenue.commissions),
      fineToday: money(todayRevenue.fines),
      compensationToday: money(todayRevenue.compensations),
      revenueMonth: money(monthRevenue.revenue),
      commissionMonth: money(monthRevenue.commissions),
      fineMonth: money(monthRevenue.fines),
      compensationMonth: money(monthRevenue.compensations),
      dueCommission: dueCommission.toFixed(2),
      fineAmount: unpaidFines.toFixed(2),
      compensationAmount: unusedCompensations.toFixed(2),
      completedOrdersToday: completedTodayCount,
      activeTrips,
      activeDriversOnline,
      totalDrivers,
      employeesTotal,
      employeesByRole: roleCounts,
      revenueWeek: weekSeries
    };
  }
};
