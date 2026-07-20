import type { Server } from "socket.io";
import { FinancialTransactionType, OrderStatus, Role } from "@prisma/client";
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

export const adminService = {
  async dashboardStats(io?: Server) {
    const today = syriaCalendarDayIso();
    const { from, toExclusive } = syriaDayUtcRange(today);

    const completedTodayWhere = {
      status: OrderStatus.COMPLETED,
      completedAt: { gte: from, lt: toExclusive }
    };

    const [
      revenueTodayAgg,
      commissionTodayAgg,
      dueCommissionAgg,
      fineAgg,
      compensationAgg,
      completedTodayCount,
      activeTrips,
      totalDrivers,
      employeesByRole,
      connectedIds
    ] = await Promise.all([
      prisma.order.aggregate({
        where: completedTodayWhere,
        _sum: { amount: true }
      }),
      prisma.commission.aggregate({
        where: { order: { is: completedTodayWhere } },
        _sum: { calculatedCommission: true }
      }),
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

    const dueCommissionRaw = Number(dueCommissionAgg._sum.remainingAmount ?? 0) || 0;
    const fineAmount = Number(fineAgg._sum.amount ?? 0) || 0;
    const compensationAmount = Number(compensationAgg._sum.amount ?? 0) || 0;
    const dueCommission = Math.max(0, dueCommissionRaw - compensationAmount + fineAmount);

    return {
      today,
      revenueToday: (revenueTodayAgg._sum.amount ?? 0).toString(),
      commissionToday: (commissionTodayAgg._sum.calculatedCommission ?? 0).toString(),
      dueCommission: dueCommission.toFixed(2),
      fineAmount: fineAmount.toFixed(2),
      compensationAmount: compensationAmount.toFixed(2),
      completedOrdersToday: completedTodayCount,
      activeTrips,
      activeDriversOnline,
      totalDrivers,
      employeesTotal,
      employeesByRole: roleCounts
    };
  }
};
