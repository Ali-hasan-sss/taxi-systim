import { CommissionType, OrderBroadcastTarget, OrderStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { syriaCalendarDayIso } from "../../shared/syria-time";
import type { CreateOrderDto } from "./orders.dto";

const toNum = (d: Prisma.Decimal | number) => Number(d);

export const COORDINATOR_ORDERS_PAGE_DEFAULT = 10;
export const COORDINATOR_ORDERS_PAGE_MAX = 50;

function encodeOrderCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
    "utf8"
  ).toString("base64url");
}

function decodeOrderCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const p = JSON.parse(raw) as { createdAt?: string; id?: string };
    if (typeof p.createdAt !== "string" || typeof p.id !== "string") return null;
    const d = new Date(p.createdAt);
    if (Number.isNaN(d.getTime())) return null;
    return { createdAt: d, id: p.id };
  } catch {
    return null;
  }
}

export const ordersService = {
  async createOrder(coordinatorUserId: string, payload: CreateOrderDto) {
    const coordinator = await prisma.coordinator.upsert({
      where: { userId: coordinatorUserId },
      update: {},
      create: { userId: coordinatorUserId }
    });

    const customerName =
      payload.customerName?.trim() ||
      (payload.customerPhone ? `زبون ${payload.customerPhone.trim()}` : "زبون");

    return prisma.order.create({
      data: {
        customerName,
        customerPhone: payload.customerPhone?.trim(),
        pickupAddress: payload.pickupAddress.trim(),
        dropoffAddress: payload.dropoffAddress.trim(),
        amount: payload.amount,
        notes: payload.notes?.trim(),
        broadcastTarget: payload.broadcastTarget,
        pickupLat: payload.pickupLat,
        pickupLng: payload.pickupLng,
        coordinatorId: coordinator.id
      }
    });
  },

  async cancelByCoordinator(coordinatorUserId: string, orderId: string) {
    const coordinator = await prisma.coordinator.findUnique({ where: { userId: coordinatorUserId } });
    if (!coordinator) throw new AppError("ملف المنسق غير موجود", 404);

    const order = await prisma.order.findFirst({
      where: { id: orderId, coordinatorId: coordinator.id }
    });
    if (!order) throw new AppError("الطلب غير موجود", 404);
    if (order.status !== OrderStatus.PENDING) {
      throw new AppError("يمكن إلغاء الطلب المعلق فقط قبل استلام سائق", 400);
    }
    if (order.driverId) {
      throw new AppError("الطلب مُسندًا بالفعل", 400);
    }

    return prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() }
    });
  },

  async assignByCoordinator(coordinatorUserId: string, orderId: string, driverId: string) {
    return prisma.$transaction(async (tx) => {
      const coordinator = await tx.coordinator.findUnique({ where: { userId: coordinatorUserId } });
      if (!coordinator) throw new AppError("ملف المنسق غير موجود", 404);

      const order = await tx.order.findFirst({
        where: { id: orderId, coordinatorId: coordinator.id }
      });
      if (!order) throw new AppError("الطلب غير موجود", 404);
      if (order.status !== OrderStatus.PENDING) {
        throw new AppError("يمكن الإسناد للطلب المعلق فقط", 400);
      }
      if (order.driverId) throw new AppError("الطلب مُسندًا بالفعل", 400);

      const driver = await tx.driver.findFirst({
        where: {
          id: driverId,
          user: { role: Role.DRIVER, isActive: true }
        },
        include: { user: { select: { fullName: true } } }
      });
      if (!driver) throw new AppError("السائق غير موجود أو غير مفعّل", 404);
      if (driver.isBusy) throw new AppError("السائق مشغول بطلب آخر", 400);

      await tx.driver.update({
        where: { id: driverId },
        data: { isBusy: true }
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          driverId,
          status: OrderStatus.ACCEPTED,
          acceptedAt: new Date()
        },
        include: {
          driver: { include: { user: { select: { fullName: true, phone: true } } } }
        }
      });

      return updated;
    });
  },

  /** نشط: غير المكتمل وغير الملغى. أرشيف: مكتمل أو ملغى فقط. ترقيم بمؤشر بعد التاريخ ثم المعرّف. */
  async listForCoordinator(
    coordinatorUserId: string,
    scope: "active" | "archive" = "active",
    opts?: { limit?: number; cursor?: string | null }
  ) {
    const coordinator = await prisma.coordinator.findUnique({ where: { userId: coordinatorUserId } });
    if (!coordinator) {
      return { orders: [], nextCursor: null };
    }

    const rawLimit = opts?.limit ?? COORDINATOR_ORDERS_PAGE_DEFAULT;
    const limit = Math.min(COORDINATOR_ORDERS_PAGE_MAX, Math.max(1, rawLimit));
    const decoded = opts?.cursor ? decodeOrderCursor(opts.cursor) : null;

    const statusWhere =
      scope === "archive"
        ? { status: { in: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] } }
        : { status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] } };

    const cursorWhere: Prisma.OrderWhereInput | undefined = decoded
      ? {
          OR: [
            { createdAt: { lt: decoded.createdAt } },
            { AND: [{ createdAt: decoded.createdAt }, { id: { lt: decoded.id } }] }
          ]
        }
      : undefined;

    const where: Prisma.OrderWhereInput = cursorWhere
      ? { AND: [{ coordinatorId: coordinator.id, ...statusWhere }, cursorWhere] }
      : { coordinatorId: coordinator.id, ...statusWhere };

    const take = limit + 1;
    const rows = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      include: {
        driver: {
          include: {
            user: { select: { fullName: true, phone: true } }
          }
        }
      }
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && page.length > 0 ? encodeOrderCursor(page[page.length - 1]!) : null;

    return { orders: page, nextCursor };
  },

  /** إحصائيات طلبات السائق المرتبطة بـ driverId (نشطة = مقبولة/وصل/بدأت، معلقة = PENDING، إلخ). */
  async orderStatsForDriver(driverUserId: string) {
    const driver = await prisma.driver.findUnique({ where: { userId: driverUserId } });
    if (!driver) {
      return { active: 0, pending: 0, completed: 0, cancelled: 0 };
    }

    const grouped = await prisma.order.groupBy({
      by: ["status"],
      where: { driverId: driver.id },
      _count: { _all: true }
    });

    const count = (status: OrderStatus) => grouped.find((g) => g.status === status)?._count._all ?? 0;

    const active =
      count(OrderStatus.ACCEPTED) + count(OrderStatus.ARRIVED) + count(OrderStatus.STARTED);
    const pending = count(OrderStatus.PENDING);
    const completed = count(OrderStatus.COMPLETED);
    const cancelled = count(OrderStatus.CANCELLED);

    return { active, pending, completed, cancelled };
  },

  /**
   * ملخص طلبات المنسق لـ«اليوم» بتوقيت سوريا (دمشق): من 00:00 إلى 23:59:59 محليًا.
   * يتجدد تلقائيًا بعد منتصف الليل بتوقيت Asia/Damascus.
   */
  async orderStatsForCoordinator(coordinatorUserId: string) {
    const summaryDaySyria = syriaCalendarDayIso();

    const coordinator = await prisma.coordinator.findUnique({ where: { userId: coordinatorUserId } });
    if (!coordinator) {
      return { active: 0, pending: 0, completed: 0, cancelled: 0, summaryDaySyria };
    }

    const rows = await prisma.$queryRaw<Array<{ status: OrderStatus; cnt: bigint }>>`
      SELECT o."status", COUNT(*)::bigint AS cnt
      FROM "Order" o
      WHERE o."coordinatorId" = ${coordinator.id}
        AND (
          (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Damascus'
        )::date = (
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Damascus')
        )::date
      GROUP BY o."status"
    `;

    const count = (status: OrderStatus) => {
      const row = rows.find((r) => r.status === status);
      return Number(row?.cnt ?? 0n);
    };

    const active =
      count(OrderStatus.ACCEPTED) + count(OrderStatus.ARRIVED) + count(OrderStatus.STARTED);
    const pending = count(OrderStatus.PENDING);
    const completed = count(OrderStatus.COMPLETED);
    const cancelled = count(OrderStatus.CANCELLED);

    return { active, pending, completed, cancelled, summaryDaySyria };
  },

  async acceptOrder(orderId: string, driverId: string) {
    return prisma.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.ACCEPTED, driverId, acceptedAt: new Date() }
    });
  },

  async completeOrder(orderId: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || !order.driverId) throw new AppError("Invalid order", 400);
      if (order.status === OrderStatus.COMPLETED) return order;

      const setting = await tx.systemSettings.findFirst({ where: { key: "commission" } });
      if (!setting) throw new AppError("Missing commission settings", 400);

      const amount = toNum(order.amount);
      const settingValue = toNum(setting.commissionValue);
      const calculated =
        setting.commissionType === CommissionType.PERCENTAGE ? (amount * settingValue) / 100 : settingValue;

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.COMPLETED, completedAt: new Date() }
      });

      await tx.driver.update({
        where: { id: order.driverId },
        data: { isBusy: false }
      });

      await tx.commission.upsert({
        where: { orderId: order.id },
        update: {},
        create: {
          orderId: order.id,
          driverId: order.driverId,
          commissionType: setting.commissionType,
          commissionValue: setting.commissionValue,
          orderAmount: order.amount,
          calculatedCommission: calculated,
          remainingAmount: calculated
        }
      });

      const balance = await tx.driverBalance.findUnique({ where: { driverId: order.driverId } });
      const current = balance ?? (await tx.driverBalance.create({ data: { driverId: order.driverId } }));

      await tx.driverBalance.update({
        where: { driverId: order.driverId },
        data: {
          totalEarnings: toNum(current.totalEarnings) + amount,
          totalCommissions: toNum(current.totalCommissions) + calculated,
          remainingDebt: toNum(current.remainingDebt) + calculated,
          availableBalance: toNum(current.availableBalance) + (amount - calculated)
        }
      });

      await tx.financialTransaction.create({
        data: {
          driverId: order.driverId,
          type: "COMMISSION_CREATED",
          amount: calculated,
          notes: `Commission for order ${order.id}`,
          referenceId: order.id
        }
      });

      return order;
    });
  }
};

export function orderToSocketPayload(order: {
  id: string;
  coordinatorId: string;
  driverId: string | null;
  customerName: string;
  customerPhone: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  amount: Prisma.Decimal;
  status: OrderStatus;
  broadcastTarget: OrderBroadcastTarget;
  createdAt: Date;
}) {
  return {
    orderId: order.id,
    coordinatorId: order.coordinatorId,
    driverId: order.driverId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    pickupAddress: order.pickupAddress,
    dropoffAddress: order.dropoffAddress,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    amount: toNum(order.amount),
    status: order.status,
    broadcastTarget: order.broadcastTarget,
    createdAt: order.createdAt.toISOString()
  };
}
