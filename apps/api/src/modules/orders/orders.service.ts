import {
  CommissionType,
  FinancialTransactionType,
  OrderBroadcastTarget,
  OrderStatus,
  Prisma,
  Role
} from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { SYRIA_TIME_ZONE, syriaCalendarDayIso } from "../../shared/syria-time";
import { getDriverLocationsForNearest } from "../../socket";
import type { CreateOrderDto } from "./orders.dto";
import { driverMatchesOrderVehicle } from "./order-vehicle-filter";

const orderIncludeDriverUser = {
  driver: { include: { user: { select: { fullName: true, phone: true } } } }
} as const;

const orderIncludeAdmin = {
  ...orderIncludeDriverUser,
  coordinator: { include: { user: { select: { fullName: true } } } }
} as const;

/** حالات «في الطريق إلى الزبون» التي تستحق إرسال معلومات السائق */
const COORDINATOR_CUSTOMER_INFO_STATUSES = [
  OrderStatus.EN_ROUTE_TO_CUSTOMER,
  OrderStatus.ACCEPTED,
  OrderStatus.ARRIVED
] as const;

export type CoordinatorOrdersListSegment =
  | "pending"
  | "in_progress"
  | "stuck"
  | "needs_info"
  | "needs_invoice"
  | "completed";

function coordinatorCustomerPhoneWhere(): Prisma.OrderWhereInput {
  return {
    AND: [{ customerPhone: { not: null } }, { NOT: { customerPhone: "" } }]
  };
}

function coordinatorNeedsInfoWhere(): Prisma.OrderWhereInput {
  return {
    status: { in: [...COORDINATOR_CUSTOMER_INFO_STATUSES] },
    customerInfoSentAt: null,
    driverId: { not: null },
    ...coordinatorCustomerPhoneWhere()
  };
}

function coordinatorNeedsInvoiceWhere(): Prisma.OrderWhereInput {
  return {
    status: OrderStatus.COMPLETED,
    invoiceSentAt: null,
    ...coordinatorCustomerPhoneWhere()
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function listPendingVisibleToDriver(driverDbId: string) {
  const driverRow = await prisma.driver.findUnique({
    where: { id: driverDbId },
    select: { vehicleKind: true }
  });
  const driverKind = driverRow?.vehicleKind ?? null;

  const all = await prisma.order.findMany({
    where: { status: OrderStatus.PENDING, driverId: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    include: orderIncludeDriverUser
  });

  const nearestLocs = await getDriverLocationsForNearest();
  const out: typeof all = [];

  for (const order of all) {
    if (!driverMatchesOrderVehicle(order.vehicleRequirement, driverKind)) {
      continue;
    }
    if (order.broadcastTarget === OrderBroadcastTarget.ALL) {
      out.push(order);
      continue;
    }
    const refLat = order.pickupLat;
    const refLng = order.pickupLng;
    if (refLat == null || refLng == null) {
      out.push(order);
      continue;
    }
    if (nearestLocs.length === 0) {
      out.push(order);
      continue;
    }
    const locIds = nearestLocs.map((d) => d.driverId);
    const locKinds = await prisma.driver.findMany({
      where: { id: { in: locIds } },
      select: { id: true, vehicleKind: true }
    });
    const locKindMap = new Map(locKinds.map((r) => [r.id, r.vehicleKind]));
    const ranked = nearestLocs
      .map((d) => ({
        ...d,
        dKm: haversineKm(refLat, refLng, d.lat, d.lng),
        vehicleKind: locKindMap.get(d.driverId) ?? null
      }))
      .filter((d) => driverMatchesOrderVehicle(order.vehicleRequirement, d.vehicleKind))
      .sort((a, b) => a.dKm - b.dKm);
    const topIds = new Set(ranked.slice(0, 3).map((d) => d.driverId));
    if (topIds.has(driverDbId)) out.push(order);
  }

  return out;
}

const toNum = (d: Prisma.Decimal | number) => Number(d);

export const COORDINATOR_ORDERS_PAGE_DEFAULT = 10;
export const COORDINATOR_ORDERS_PAGE_MAX = 50;
export const COORDINATOR_REPORTS_PAGE_DEFAULT = 20;
export const COORDINATOR_REPORTS_PAGE_MAX = 100;
export const DRIVER_REPORTS_PAGE_DEFAULT = 20;
export const DRIVER_REPORTS_PAGE_MAX = 100;
export const ADMIN_ORDERS_ROOM_PAGE_DEFAULT = 30;
export const ADMIN_ORDERS_ROOM_PAGE_MAX = 100;
export const ADMIN_ORDERS_PAGE_DEFAULT = 20;
export const ADMIN_ORDERS_PAGE_MAX = 100;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type AdminOrdersRoomPhase = "pending" | "rest";

type AdminOrdersRoomCursor = {
  phase?: AdminOrdersRoomPhase;
  createdAt: Date;
  id: string;
};

function encodeAdminOrdersRoomCursor(row: AdminOrdersRoomCursor): string {
  return Buffer.from(
    JSON.stringify({
      phase: row.phase,
      createdAt: row.createdAt.toISOString(),
      id: row.id
    }),
    "utf8"
  ).toString("base64url");
}

function decodeAdminOrdersRoomCursor(cursor: string): AdminOrdersRoomCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const p = JSON.parse(raw) as { phase?: AdminOrdersRoomPhase; createdAt?: string; id?: string };
    if (typeof p.createdAt !== "string" || typeof p.id !== "string") return null;
    const d = new Date(p.createdAt);
    if (Number.isNaN(d.getTime())) return null;
    if (p.phase !== undefined && p.phase !== "pending" && p.phase !== "rest") return null;
    return { phase: p.phase, createdAt: d, id: p.id };
  } catch {
    return null;
  }
}

function ascOrderCursorWhere(
  decoded: { createdAt: Date; id: string } | null | undefined
): Prisma.OrderWhereInput | undefined {
  if (!decoded) return undefined;
  return {
    OR: [
      { createdAt: { gt: decoded.createdAt } },
      { AND: [{ createdAt: decoded.createdAt }, { id: { gt: decoded.id } }] }
    ]
  };
}

function descOrderCursorWhere(
  decoded: { createdAt: Date; id: string } | null | undefined
): Prisma.OrderWhereInput | undefined {
  if (!decoded) return undefined;
  return {
    OR: [
      { createdAt: { lt: decoded.createdAt } },
      { AND: [{ createdAt: decoded.createdAt }, { id: { lt: decoded.id } }] }
    ]
  };
}

function mergeOrderWhere(
  base: Prisma.OrderWhereInput,
  cursor?: Prisma.OrderWhereInput
): Prisma.OrderWhereInput {
  return cursor ? { AND: [base, cursor] } : base;
}

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
    from: zonedDateTimeToUtc(SYRIA_TIME_ZONE, fromParts.year, fromParts.month, fromParts.day, 0, 0, 0, 0),
    toExclusive: (() => {
      const next = parseYmd(nextYmdDay(toYmd));
      if (!next) throw new AppError("تاريخ النهاية غير صالح", 400);
      return zonedDateTimeToUtc(SYRIA_TIME_ZONE, next.year, next.month, next.day, 0, 0, 0, 0);
    })()
  };
}

/** السائق «مشغول» ولا يقبل طلبًا جديدًا */
const DRIVER_BUSY_STATUSES: OrderStatus[] = [
  OrderStatus.EN_ROUTE_TO_CUSTOMER,
  OrderStatus.STARTED,
  OrderStatus.ACCEPTED,
  OrderStatus.ARRIVED
];

/** في الطريق إلى الزبون (بما في ذلك القيم القديمة) */
const EN_ROUTE_LIKE: OrderStatus[] = [
  OrderStatus.EN_ROUTE_TO_CUSTOMER,
  OrderStatus.ACCEPTED,
  OrderStatus.ARRIVED
];

/** مقارنة نصية حتى لا يفشل PostgreSQL إن لم تُضف قيمة STUCK للـ enum بعد (قبل migrate). */
async function countStuckTodaySyriaForCoordinator(coordinatorId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c
    FROM "Order" o
    WHERE o."coordinatorId" = ${coordinatorId}
      AND o."status"::text = 'STUCK'
      AND (
        (o."updatedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Damascus'
      )::date = (
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Damascus')
      )::date
  `;
  return Number(rows[0]?.c ?? 0n);
}

async function countStuckTodaySyriaForDriver(driverId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c
    FROM "Order" o
    WHERE o."driverId" = ${driverId}
      AND o."status"::text = 'STUCK'
      AND (
        (o."updatedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Damascus'
      )::date = (
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Damascus')
      )::date
  `;
  return Number(rows[0]?.c ?? 0n);
}

/**
 * مجموع العمولة المستحقة (غير المسددة بعد) للطلبات التي أُكملت «اليوم» بتوقيت دمشق.
 * يطابق مجاميع `remainingAmount` في سجلات العمولة المرتبطة بهذه الطلبات.
 */
async function sumCommissionDueTodaySyriaForDriver(driverId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ s: string | null }>>`
    SELECT COALESCE(SUM(c."remainingAmount"), 0)::text AS s
    FROM "Commission" c
    INNER JOIN "Order" o ON o.id = c."orderId"
    WHERE c."driverId" = ${driverId}
      AND o."completedAt" IS NOT NULL
      AND (
        (o."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Damascus'
      )::date = (
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Damascus')
      )::date
  `;
  const t = rows[0]?.s ?? "0";
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** إجمالي العمولات غير المسددة للسائق عبر جميع الطلبات المكتملة. */
async function sumUnpaidCommissionForDriver(driverId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ s: string | null }>>`
    SELECT COALESCE(SUM(c."remainingAmount"), 0)::text AS s
    FROM "Commission" c
    INNER JOIN "Order" o ON o.id = c."orderId"
    WHERE c."driverId" = ${driverId}
      AND o."status"::text = 'COMPLETED'
      AND c."remainingAmount" > 0
  `;
  const t = rows[0]?.s ?? "0";
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export const ordersService = {
  serializeDriverOrderRow(row: Prisma.OrderGetPayload<{ include: typeof orderIncludeDriverUser }>) {
    return {
      id: row.id,
      driverId: row.driverId,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      pickupAddress: row.pickupAddress,
      dropoffAddress: row.dropoffAddress,
      amount: row.amount.toString(),
      status: row.status,
      broadcastTarget: row.broadcastTarget,
      vehicleRequirement: row.vehicleRequirement,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      customerInfoSentAt: row.customerInfoSentAt?.toISOString() ?? null,
      invoiceSentAt: row.invoiceSentAt?.toISOString() ?? null,
      driver: row.driver
        ? {
            id: row.driver.id,
            user: {
              fullName: row.driver.user.fullName ?? "",
              phone: row.driver.user.phone ?? null
            },
            vehicleBrand: row.driver.vehicleBrand ?? null,
            vehicleColor: row.driver.vehicleColor ?? null,
            vehicleNumber: row.driver.vehicleNumber ?? null,
            vehicleKind: row.driver.vehicleKind ?? null
          }
        : null
    };
  },

  serializeCoordinatorOrderRow(row: Prisma.OrderGetPayload<{ include: typeof orderIncludeDriverUser }>) {
    return this.serializeDriverOrderRow(row);
  },

  serializeAdminOrderRow(row: Prisma.OrderGetPayload<{ include: typeof orderIncludeAdmin }>) {
    const base = this.serializeDriverOrderRow(row);
    return {
      ...base,
      coordinatorName: row.coordinator.user.fullName?.trim() || "—"
    };
  },

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
        notes: payload.notes?.trim() || undefined,
        vehicleRequirement: payload.vehicleRequirement,
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

    if (order.status === OrderStatus.PENDING) {
      if (order.driverId) {
        throw new AppError("الطلب مُسندًا بالفعل", 400);
      }
      return prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() }
      });
    }

    if (order.status === OrderStatus.STUCK) {
      return prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() }
      });
    }

    throw new AppError("يمكن إلغاء الطلب المعلق قبل الإسناد، أو الطلب المتعثر فقط", 400);
  },

  /** إعادة طلب متعثر لنفس السائق: «في الطريق إلى الزبون» وتعيين السائق مشغولًا. */
  async resumeStuckOrderByCoordinator(coordinatorUserId: string, orderId: string) {
    return prisma.$transaction(async (tx) => {
      const coordinator = await tx.coordinator.findUnique({ where: { userId: coordinatorUserId } });
      if (!coordinator) throw new AppError("ملف المنسق غير موجود", 404);

      const order = await tx.order.findFirst({
        where: { id: orderId, coordinatorId: coordinator.id, status: OrderStatus.STUCK }
      });
      if (!order) throw new AppError("الطلب غير موجود أو ليس في حالة متعثرة", 404);
      if (!order.driverId) throw new AppError("لا يوجد سائق مرتبط بهذا الطلب", 400);

      const otherActive = await tx.order.findFirst({
        where: {
          driverId: order.driverId,
          id: { not: orderId },
          status: { in: DRIVER_BUSY_STATUSES }
        }
      });
      if (otherActive) {
        throw new AppError("السائق منشغل بطلب آخر قيد التنفيذ. أنهِه أولًا.", 400);
      }

      await tx.driver.update({
        where: { id: order.driverId },
        data: { isBusy: true }
      });

      return tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.EN_ROUTE_TO_CUSTOMER },
        include: orderIncludeDriverUser
      });
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
      if (!driverMatchesOrderVehicle(order.vehicleRequirement, driver.vehicleKind)) {
        throw new AppError("نوع سيارة السائق لا يطابق متطلب الطلب (عامة/خاصة)", 400);
      }

      await tx.driver.update({
        where: { id: driverId },
        data: { isBusy: true }
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          driverId,
          status: OrderStatus.EN_ROUTE_TO_CUSTOMER,
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
    opts?: {
      limit?: number;
      cursor?: string | null;
      /** معلّق / متعثرة / بحاجة معلومات / بحاجة فاتورة / مكتملة — بدونها = الكل (غير الملغاة) */
      activeSegment?: CoordinatorOrdersListSegment;
      /** أرشيف: مكتمل أو ملغى — بدونها = الاثنان */
      archiveSegment?: "completed" | "cancelled";
    }
  ) {
    const coordinator = await prisma.coordinator.findUnique({ where: { userId: coordinatorUserId } });
    if (!coordinator) {
      return { orders: [], nextCursor: null };
    }

    const rawLimit = opts?.limit ?? COORDINATOR_ORDERS_PAGE_DEFAULT;
    const limit = Math.min(COORDINATOR_ORDERS_PAGE_MAX, Math.max(1, rawLimit));
    const decoded = opts?.cursor ? decodeOrderCursor(opts.cursor) : null;

    const inProgressStatuses = [
      OrderStatus.EN_ROUTE_TO_CUSTOMER,
      OrderStatus.STARTED,
      OrderStatus.ACCEPTED,
      OrderStatus.ARRIVED
    ] as const;

    const statusWhere: Prisma.OrderWhereInput =
      scope === "archive"
        ? opts?.archiveSegment === "completed"
          ? { status: OrderStatus.COMPLETED }
          : opts?.archiveSegment === "cancelled"
            ? { status: OrderStatus.CANCELLED }
            : { status: { in: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] } }
        : opts?.activeSegment === "pending"
          ? { status: OrderStatus.PENDING }
          : opts?.activeSegment === "in_progress"
            ? { status: { in: [...inProgressStatuses] } }
            : opts?.activeSegment === "stuck"
              ? { status: OrderStatus.STUCK }
              : opts?.activeSegment === "needs_info"
                ? coordinatorNeedsInfoWhere()
                : opts?.activeSegment === "needs_invoice"
                  ? coordinatorNeedsInvoiceWhere()
                  : opts?.activeSegment === "completed"
                    ? { status: OrderStatus.COMPLETED }
                    : { status: { not: OrderStatus.CANCELLED } };

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
      include: orderIncludeDriverUser
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && page.length > 0 ? encodeOrderCursor(page[page.length - 1]!) : null;

    return { orders: page, nextCursor };
  },

  /** غرفة الطلبات للأدمن — دفعات مع فلترة حسب الشريحة */
  async listForAdmin(opts?: {
    activeSegment?: CoordinatorOrdersListSegment;
    limit?: number;
    cursor?: string | null;
  }) {
    const rawLimit = opts?.limit ?? ADMIN_ORDERS_ROOM_PAGE_DEFAULT;
    const limit = Math.min(ADMIN_ORDERS_ROOM_PAGE_MAX, Math.max(1, rawLimit));
    const seg = opts?.activeSegment;

    if (seg === undefined) {
      return this.listForAdminAll({ limit, cursor: opts?.cursor });
    }

    const inProgressStatuses = [
      OrderStatus.EN_ROUTE_TO_CUSTOMER,
      OrderStatus.STARTED,
      OrderStatus.ACCEPTED,
      OrderStatus.ARRIVED
    ] as const;

    const statusWhere: Prisma.OrderWhereInput =
      seg === "pending"
        ? { status: OrderStatus.PENDING }
        : seg === "in_progress"
          ? { status: { in: [...inProgressStatuses] } }
          : seg === "stuck"
            ? { status: OrderStatus.STUCK }
            : seg === "needs_info"
              ? coordinatorNeedsInfoWhere()
              : seg === "needs_invoice"
                ? coordinatorNeedsInvoiceWhere()
                : seg === "completed"
                  ? { status: OrderStatus.COMPLETED }
                  : { status: { not: OrderStatus.CANCELLED } };

    const orderAsc = seg === "pending";
    const decoded = opts?.cursor ? decodeOrderCursor(opts.cursor) : null;
    const cursorWhere = orderAsc ? ascOrderCursorWhere(decoded) : descOrderCursorWhere(decoded);
    const where = mergeOrderWhere(statusWhere, cursorWhere);

    const rows = await prisma.order.findMany({
      where,
      orderBy: orderAsc
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: orderIncludeAdmin
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && page.length > 0 ? encodeOrderCursor(page[page.length - 1]!) : null;

    return { orders: page, nextCursor };
  },

  /** تاب «الكل»: المعلّقة أولاً (الأقدم أولاً) ثم باقي الطلبات */
  async listForAdminAll(opts: { limit: number; cursor?: string | null }) {
    type AdminOrderRow = Prisma.OrderGetPayload<{ include: typeof orderIncludeAdmin }>;

    const decoded = opts.cursor ? decodeAdminOrdersRoomCursor(opts.cursor) : null;
    const startPhase: AdminOrdersRoomPhase = decoded?.phase ?? "pending";
    let remaining = opts.limit;
    const collected: AdminOrderRow[] = [];

    if (startPhase === "pending") {
      const pendingCursor =
        decoded?.phase === "pending" ? ascOrderCursorWhere(decoded) : undefined;
      const pendingWhere = mergeOrderWhere({ status: OrderStatus.PENDING }, pendingCursor);
      const pendingRows = await prisma.order.findMany({
        where: pendingWhere,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: remaining + 1,
        include: orderIncludeAdmin
      });

      const pendingHasMore = pendingRows.length > remaining;
      const pendingPage = pendingHasMore ? pendingRows.slice(0, remaining) : pendingRows;
      collected.push(...pendingPage);
      remaining -= pendingPage.length;

      if (pendingHasMore) {
        const last = pendingPage[pendingPage.length - 1]!;
        return {
          orders: collected,
          nextCursor: encodeAdminOrdersRoomCursor({
            phase: "pending",
            createdAt: last.createdAt,
            id: last.id
          })
        };
      }
    }

    if (remaining > 0) {
      const restCursor = decoded?.phase === "rest" ? descOrderCursorWhere(decoded) : undefined;
      const restWhere = mergeOrderWhere(
        {
          AND: [{ status: { not: OrderStatus.CANCELLED } }, { status: { not: OrderStatus.PENDING } }]
        },
        restCursor
      );
      const restRows = await prisma.order.findMany({
        where: restWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: remaining + 1,
        include: orderIncludeAdmin
      });

      const restHasMore = restRows.length > remaining;
      const restPage = restHasMore ? restRows.slice(0, remaining) : restRows;
      collected.push(...restPage);

      if (restHasMore) {
        const last = restPage[restPage.length - 1]!;
        return {
          orders: collected,
          nextCursor: encodeAdminOrdersRoomCursor({
            phase: "rest",
            createdAt: last.createdAt,
            id: last.id
          })
        };
      }
    }

    return { orders: collected, nextCursor: null };
  },

  async orderStatsForAdmin() {
    const [filterAll, filterPending, filterStuck, filterCompleted, filterNeedsInfo, filterNeedsInvoice, filterInProgress] =
      await Promise.all([
        prisma.order.count({ where: { status: { not: OrderStatus.CANCELLED } } }),
        prisma.order.count({ where: { status: OrderStatus.PENDING } }),
        prisma.order.count({ where: { status: OrderStatus.STUCK } }),
        prisma.order.count({ where: { status: OrderStatus.COMPLETED } }),
        prisma.order.count({ where: coordinatorNeedsInfoWhere() }),
        prisma.order.count({ where: coordinatorNeedsInvoiceWhere() }),
        prisma.order.count({
          where: {
            status: {
              in: [
                OrderStatus.EN_ROUTE_TO_CUSTOMER,
                OrderStatus.STARTED,
                OrderStatus.ACCEPTED,
                OrderStatus.ARRIVED
              ]
            }
          }
        })
      ]);

    return {
      filterCounts: {
        all: filterAll,
        needs_info: filterNeedsInfo,
        needs_invoice: filterNeedsInvoice,
        stuck: filterStuck,
        pending: filterPending,
        completed: filterCompleted,
        in_progress: filterInProgress
      }
    };
  },

  /** تقارير طلبات المنسق حسب تاريخ الإنشاء ضمن فترة، مع فلتر اختياري بالسائق وإجماليات كاملة. */
  async reportForCoordinator(
    coordinatorUserId: string,
    opts?: {
      from?: string | null;
      to?: string | null;
      driverId?: string | null;
      cursor?: string | null;
      limit?: number;
    }
  ) {
    const coordinator = await prisma.coordinator.findUnique({ where: { userId: coordinatorUserId } });
    if (!coordinator) {
      return {
        orders: [],
        nextCursor: null,
        summary: {
          orderCount: 0,
          totalAmount: "0.00",
          from: opts?.from ?? syriaCalendarDayIso(),
          to: opts?.to ?? opts?.from ?? syriaCalendarDayIso()
        }
      };
    }

    const from = opts?.from?.trim() || syriaCalendarDayIso();
    const to = opts?.to?.trim() || from;
    const { from: fromUtc, toExclusive } = syriaDayRangeUtc(from, to);
    const rawLimit = opts?.limit ?? COORDINATOR_REPORTS_PAGE_DEFAULT;
    const limit = Math.min(COORDINATOR_REPORTS_PAGE_MAX, Math.max(1, rawLimit));
    const decoded = opts?.cursor ? decodeOrderCursor(opts.cursor) : null;

    const baseWhere: Prisma.OrderWhereInput = {
      coordinatorId: coordinator.id,
      createdAt: { gte: fromUtc, lt: toExclusive },
      ...(opts?.driverId ? { driverId: opts.driverId } : {})
    };

    const cursorWhere: Prisma.OrderWhereInput | undefined = decoded
      ? {
          OR: [
            { createdAt: { lt: decoded.createdAt } },
            { AND: [{ createdAt: decoded.createdAt }, { id: { lt: decoded.id } }] }
          ]
        }
      : undefined;

    const where: Prisma.OrderWhereInput = cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere;

    const completedAmountWhere: Prisma.OrderWhereInput = {
      ...baseWhere,
      status: OrderStatus.COMPLETED
    };

    const [aggregate, completedAmountAggregate, rows] = await Promise.all([
      prisma.order.aggregate({
        where: baseWhere,
        _count: { _all: true },
        _sum: { amount: true }
      }),
      prisma.order.aggregate({
        where: completedAmountWhere,
        _sum: { amount: true }
      }),
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: orderIncludeDriverUser
      })
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && page.length > 0 ? encodeOrderCursor(page[page.length - 1]!) : null;

    return {
      orders: page,
      nextCursor,
      summary: {
        orderCount: aggregate._count._all,
        totalAmount: (completedAmountAggregate._sum.amount ?? new Prisma.Decimal(0)).toString(),
        from,
        to
      }
    };
  },

  /** تقارير السائق حسب تاريخ إنشاء الطلب ضمن فترة، مع إجمالي المبالغ المكتملة والعمولة المحسوبة عليها. */
  async reportForDriver(
    driverUserId: string,
    opts?: {
      from?: string | null;
      to?: string | null;
      cursor?: string | null;
      limit?: number;
    }
  ) {
    const driver = await prisma.driver.findUnique({ where: { userId: driverUserId } });
    if (!driver) {
      return {
        orders: [],
        nextCursor: null,
        summary: {
          orderCount: 0,
          totalAmount: "0.00",
          totalCommission: "0.00",
          from: opts?.from ?? syriaCalendarDayIso(),
          to: opts?.to ?? opts?.from ?? syriaCalendarDayIso()
        }
      };
    }

    const from = opts?.from?.trim() || syriaCalendarDayIso();
    const to = opts?.to?.trim() || from;
    const { from: fromUtc, toExclusive } = syriaDayRangeUtc(from, to);
    const rawLimit = opts?.limit ?? DRIVER_REPORTS_PAGE_DEFAULT;
    const limit = Math.min(DRIVER_REPORTS_PAGE_MAX, Math.max(1, rawLimit));
    const decoded = opts?.cursor ? decodeOrderCursor(opts.cursor) : null;

    const baseWhere: Prisma.OrderWhereInput = {
      driverId: driver.id,
      createdAt: { gte: fromUtc, lt: toExclusive },
      status: OrderStatus.COMPLETED
    };

    const cursorWhere: Prisma.OrderWhereInput | undefined = decoded
      ? {
          OR: [
            { createdAt: { lt: decoded.createdAt } },
            { AND: [{ createdAt: decoded.createdAt }, { id: { lt: decoded.id } }] }
          ]
        }
      : undefined;

    const where: Prisma.OrderWhereInput = cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere;

    const [aggregate, completedAmountAggregate, dueCommissionAggregate, rows] = await Promise.all([
      prisma.order.aggregate({
        where: baseWhere,
        _count: { _all: true }
      }),
      prisma.order.aggregate({
        where: baseWhere,
        _sum: { amount: true }
      }),
      prisma.commission.aggregate({
        where: {
          driverId: driver.id,
          order: {
            is: {
              createdAt: { gte: fromUtc, lt: toExclusive },
              status: OrderStatus.COMPLETED
            }
          }
        },
        _sum: { remainingAmount: true }
      }),
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: {
          ...orderIncludeDriverUser,
          commission: {
            select: {
              calculatedCommission: true,
              paymentStatus: true,
              remainingAmount: true
            }
          }
        }
      })
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && page.length > 0 ? encodeOrderCursor(page[page.length - 1]!) : null;

    return {
      orders: page.map((row) => ({
        ...this.serializeDriverOrderRow(row),
        commission: row.commission
          ? {
              calculatedCommission: row.commission.calculatedCommission.toString(),
              paymentStatus: row.commission.paymentStatus,
              remainingAmount: row.commission.remainingAmount.toString()
            }
          : null
      })),
      nextCursor,
      summary: {
        orderCount: aggregate._count._all,
        totalAmount: (completedAmountAggregate._sum.amount ?? new Prisma.Decimal(0)).toString(),
        totalCommission: (dueCommissionAggregate._sum.remainingAmount ?? new Prisma.Decimal(0)).toString(),
        from,
        to
      }
    };
  },

  /** طلبات السائق المسندة إليه: نشط = غير مكتمل/ملغى، أرشيف = مكتمل أو ملغى أو متعثر (أو شريحة واحدة عبر archiveSegment). */
  async listForDriver(
    driverUserId: string,
    scope: "active" | "archive" = "active",
    opts?: {
      limit?: number;
      cursor?: string | null;
      archiveSegment?: "completed" | "cancelled" | "stuck";
    }
  ) {
    const driver = await prisma.driver.findUnique({ where: { userId: driverUserId } });
    if (!driver) {
      return { orders: [], nextCursor: null };
    }

    const rawLimit = opts?.limit ?? COORDINATOR_ORDERS_PAGE_DEFAULT;
    const limit = Math.min(COORDINATOR_ORDERS_PAGE_MAX, Math.max(1, rawLimit));
    const decoded = opts?.cursor ? decodeOrderCursor(opts.cursor) : null;

    const archiveStatuses = (() => {
      const seg = opts?.archiveSegment;
      if (seg === "completed") return [OrderStatus.COMPLETED];
      if (seg === "cancelled") return [OrderStatus.CANCELLED];
      if (seg === "stuck") return [OrderStatus.STUCK];
      return [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.STUCK];
    })();

    const statusWhere =
      scope === "archive"
        ? { status: { in: archiveStatuses } }
        : { status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.STUCK] } };

    const cursorWhere: Prisma.OrderWhereInput | undefined = decoded
      ? {
          OR: [
            { createdAt: { lt: decoded.createdAt } },
            { AND: [{ createdAt: decoded.createdAt }, { id: { lt: decoded.id } }] }
          ]
        }
      : undefined;

    const baseWhere: Prisma.OrderWhereInput = { driverId: driver.id, ...statusWhere };
    const where: Prisma.OrderWhereInput = cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere;

    const take = limit + 1;
    const rows = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      include: orderIncludeDriverUser
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
      return {
        active: 0,
        pending: 0,
        completed: 0,
        cancelled: 0,
        stuckToday: 0,
        commissionDueTodaySyria: 0,
        unpaidCommissionAmount: 0,
        summaryDaySyria: syriaCalendarDayIso()
      };
    }

    const grouped = await prisma.order.groupBy({
      by: ["status"],
      where: { driverId: driver.id },
      _count: { _all: true }
    });

    const count = (status: OrderStatus) => grouped.find((g) => g.status === status)?._count._all ?? 0;

    const active =
      count(OrderStatus.EN_ROUTE_TO_CUSTOMER) +
      count(OrderStatus.STARTED) +
      count(OrderStatus.ACCEPTED) +
      count(OrderStatus.ARRIVED);
    const pending = count(OrderStatus.PENDING);
    const completed = count(OrderStatus.COMPLETED);
    const cancelled = count(OrderStatus.CANCELLED);
    const summaryDaySyria = syriaCalendarDayIso();
    const stuckToday = await countStuckTodaySyriaForDriver(driver.id);
    const [commissionDueTodaySyria, unpaidCommissionAmount] = await Promise.all([
      sumCommissionDueTodaySyriaForDriver(driver.id),
      sumUnpaidCommissionForDriver(driver.id)
    ]);

    return {
      active,
      pending,
      completed,
      cancelled,
      stuckToday,
      commissionDueTodaySyria,
      unpaidCommissionAmount,
      summaryDaySyria
    };
  },

  /**
   * ملخص طلبات المنسق لـ«اليوم» بتوقيت سوريا (دمشق): من 00:00 إلى 23:59:59 محليًا.
   * يتجدد تلقائيًا بعد منتصف الليل بتوقيت Asia/Damascus.
   */
  async orderStatsForCoordinator(coordinatorUserId: string) {
    const summaryDaySyria = syriaCalendarDayIso();

    const coordinator = await prisma.coordinator.findUnique({ where: { userId: coordinatorUserId } });
    if (!coordinator) {
      return {
        active: 0,
        pending: 0,
        completed: 0,
        cancelled: 0,
        stuckToday: 0,
        stuckActive: 0,
        summaryDaySyria,
        filterCounts: {
          all: 0,
          needs_info: 0,
          needs_invoice: 0,
          stuck: 0,
          pending: 0,
          completed: 0
        }
      };
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
      count(OrderStatus.EN_ROUTE_TO_CUSTOMER) +
      count(OrderStatus.STARTED) +
      count(OrderStatus.ACCEPTED) +
      count(OrderStatus.ARRIVED);
    const pending = count(OrderStatus.PENDING);
    const completed = count(OrderStatus.COMPLETED);
    const cancelled = count(OrderStatus.CANCELLED);
    const stuckToday = await countStuckTodaySyriaForCoordinator(coordinator.id);
    const stuckActive = await prisma.order.count({
      where: { coordinatorId: coordinator.id, status: OrderStatus.STUCK }
    });

    const coordinatorBase = { coordinatorId: coordinator.id };
    const [filterAll, filterPending, filterStuck, filterCompleted, filterNeedsInfo, filterNeedsInvoice] =
      await Promise.all([
        prisma.order.count({ where: { ...coordinatorBase, status: { not: OrderStatus.CANCELLED } } }),
        prisma.order.count({ where: { ...coordinatorBase, status: OrderStatus.PENDING } }),
        prisma.order.count({ where: { ...coordinatorBase, status: OrderStatus.STUCK } }),
        prisma.order.count({ where: { ...coordinatorBase, status: OrderStatus.COMPLETED } }),
        prisma.order.count({ where: { ...coordinatorBase, ...coordinatorNeedsInfoWhere() } }),
        prisma.order.count({ where: { ...coordinatorBase, ...coordinatorNeedsInvoiceWhere() } })
      ]);

    return {
      active,
      pending,
      completed,
      cancelled,
      stuckToday,
      stuckActive,
      summaryDaySyria,
      filterCounts: {
        all: filterAll,
        needs_info: filterNeedsInfo,
        needs_invoice: filterNeedsInvoice,
        stuck: filterStuck,
        pending: filterPending,
        completed: filterCompleted
      }
    };
  },

  async markCustomerInfoSentByCoordinator(coordinatorUserId: string, orderId: string) {
    const coordinator = await prisma.coordinator.findUnique({ where: { userId: coordinatorUserId } });
    if (!coordinator) throw new AppError("ملف المنسق غير موجود", 404);

    const order = await prisma.order.findFirst({
      where: { id: orderId, coordinatorId: coordinator.id },
      include: orderIncludeDriverUser
    });
    if (!order) throw new AppError("الطلب غير موجود أو لا يخصّك", 404);

    if (!(COORDINATOR_CUSTOMER_INFO_STATUSES as readonly OrderStatus[]).includes(order.status)) {
      throw new AppError("لا يمكن إرسال معلومات السائق في هذه الحالة", 400);
    }
    if (!order.driverId) {
      throw new AppError("لا يوجد سائق مُسند لهذا الطلب", 400);
    }
    const phone = order.customerPhone?.trim();
    if (!phone) {
      throw new AppError("لا يوجد رقم هاتف للزبون", 400);
    }
    if (order.customerInfoSentAt) {
      return order;
    }

    return prisma.order.update({
      where: { id: orderId },
      data: { customerInfoSentAt: new Date() },
      include: orderIncludeDriverUser
    });
  },

  async markInvoiceSentByCoordinator(coordinatorUserId: string, orderId: string) {
    const coordinator = await prisma.coordinator.findUnique({ where: { userId: coordinatorUserId } });
    if (!coordinator) throw new AppError("ملف المنسق غير موجود", 404);

    const order = await prisma.order.findFirst({
      where: { id: orderId, coordinatorId: coordinator.id },
      include: orderIncludeDriverUser
    });
    if (!order) throw new AppError("الطلب غير موجود أو لا يخصّك", 404);

    if (order.status !== OrderStatus.COMPLETED) {
      throw new AppError("إرسال الفاتورة متاح للطلبات المكتملة فقط", 400);
    }
    const phone = order.customerPhone?.trim();
    if (!phone) {
      throw new AppError("لا يوجد رقم هاتف للزبون", 400);
    }
    if (order.invoiceSentAt) {
      return order;
    }

    return prisma.order.update({
      where: { id: orderId },
      data: { invoiceSentAt: new Date() },
      include: orderIncludeDriverUser
    });
  },

  /** غرفة السائق: طلب قيد التنفيذ فقط إن وُجد، وإلا الطلبات المعلقة المتاحة له (بث). */
  async driverOrderRoom(driverUserId: string) {
    const driver = await prisma.driver.findUnique({ where: { userId: driverUserId } });
    if (!driver) {
      return { inProgress: null, pending: [] };
    }

    const inProgress = await prisma.order.findFirst({
      where: {
        driverId: driver.id,
        status: { in: DRIVER_BUSY_STATUSES }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: orderIncludeDriverUser
    });

    if (inProgress) {
      return { inProgress, pending: [] };
    }

    if (!driver.isOnline) {
      return { inProgress: null, pending: [] };
    }

    const pending = await listPendingVisibleToDriver(driver.id);
    return { inProgress: null, pending };
  },

  async acceptOrderByDriver(driverUserId: string, orderId: string) {
    return prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { userId: driverUserId } });
      if (!driver) throw new AppError("ملف السائق غير موجود", 404);
      if (driver.isBusy) throw new AppError("لديك طلب قيد التنفيذ. أنهِه أولًا.", 400);

      const busyOrder = await tx.order.findFirst({
        where: {
          driverId: driver.id,
          status: { in: DRIVER_BUSY_STATUSES }
        }
      });
      if (busyOrder) throw new AppError("لديك طلب قيد التنفيذ. أنهِه أولًا.", 400);

      const orderRow = await tx.order.findFirst({
        where: { id: orderId, status: OrderStatus.PENDING, driverId: null }
      });
      if (!orderRow) throw new AppError("الطلب غير متاح أو قبِلَه سائق آخر", 409);
      if (!driverMatchesOrderVehicle(orderRow.vehicleRequirement, driver.vehicleKind)) {
        throw new AppError("نوع سيارتك لا يطابق متطلب هذا الطلب (عامة/خاصة)", 400);
      }

      const updated = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING, driverId: null },
        data: {
          driverId: driver.id,
          status: OrderStatus.EN_ROUTE_TO_CUSTOMER,
          acceptedAt: new Date()
        }
      });
      if (updated.count !== 1) {
        throw new AppError("الطلب غير متاح أو قبِلَه سائق آخر", 409);
      }

      await tx.driver.update({
        where: { id: driver.id },
        data: { isBusy: true }
      });

      return tx.order.findFirstOrThrow({
        where: { id: orderId },
        include: orderIncludeDriverUser
      });
    });
  },

  async markCustomerBoardedByDriver(driverUserId: string, orderId: string) {
    return prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { userId: driverUserId } });
      if (!driver) throw new AppError("ملف السائق غير موجود", 404);

      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          driverId: driver.id,
          status: { in: EN_ROUTE_LIKE }
        }
      });
      if (!order) {
        throw new AppError("الطلب غير موجود أو لا يمكن تأكيد الركوب في هذه المرحلة", 400);
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.STARTED,
          startedAt: order.startedAt ?? new Date()
        },
        include: orderIncludeDriverUser
      });
    });
  },

  async reportCustomerNoShowByDriver(driverUserId: string, orderId: string) {
    return prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { userId: driverUserId } });
      if (!driver) throw new AppError("ملف السائق غير موجود", 404);

      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          driverId: driver.id,
          status: { in: EN_ROUTE_LIKE }
        }
      });
      if (!order) {
        throw new AppError("الطلب غير موجود أو لا يمكن تسجيل «لم أجد الزبون» في هذه المرحلة", 400);
      }

      await tx.driver.update({
        where: { id: driver.id },
        data: { isBusy: false }
      });

      return tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.STUCK },
        include: orderIncludeDriverUser
      });
    });
  },

  async completeOrder(orderId: string, driverUserId: string) {
    return prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { userId: driverUserId } });
      if (!driver) throw new AppError("ملف السائق غير موجود", 404);

      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.driverId !== driver.id) {
        throw new AppError("الطلب غير موجود أو غير مصرح بإكماله", 404);
      }

      if (order.status === OrderStatus.COMPLETED) {
        return tx.order.findFirstOrThrow({
          where: { id: orderId },
          include: orderIncludeDriverUser
        });
      }

      if (order.status !== OrderStatus.STARTED) {
        throw new AppError("أكمل «تم استلام الزبون» أولًا ثم «تم توصيل الزبون».", 400);
      }

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

      return tx.order.findFirstOrThrow({
        where: { id: orderId },
        include: orderIncludeDriverUser
      });
    });
  },

  /** تعديل أجرة الطلب: للطلبات النشطة تحديث مباشر، وللمكتملة إعادة حساب العمولة. */
  async updateOrderAmountByCoordinator(coordinatorUserId: string, orderId: string, newAmount: number) {
    const coordinator = await prisma.coordinator.findUnique({ where: { userId: coordinatorUserId } });
    if (!coordinator) throw new AppError("ملف المنسق غير موجود", 404);

    const order = await prisma.order.findFirst({
      where: { id: orderId, coordinatorId: coordinator.id }
    });
    if (!order) throw new AppError("الطلب غير موجود أو لا يخصّك", 404);

    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError("لا يمكن تعديل أجرة طلب ملغى", 400);
    }

    if (order.status === OrderStatus.COMPLETED) {
      return this.updateCompletedOrderAmountByCoordinator(coordinatorUserId, orderId, newAmount);
    }

    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      throw new AppError("المبلغ يجب أن يكون رقمًا أكبر من صفر", 400);
    }

    return prisma.order.update({
      where: { id: orderId },
      data: { amount: new Prisma.Decimal(newAmount.toFixed(2)) },
      include: orderIncludeDriverUser
    });
  },

  /**
   * تعديل أجرة طلب مكتمل: يعيد حساب العمولة ويحدّث رصيد السائق إن وُجدت عمولة غير مُسدَّدة بعد.
   * لا يُسمح إن وُجدت دفعات على سجل العمولة.
   */
  async updateCompletedOrderAmountByCoordinator(coordinatorUserId: string, orderId: string, newAmount: number) {
    const coordinator = await prisma.coordinator.findUnique({ where: { userId: coordinatorUserId } });
    if (!coordinator) throw new AppError("ملف المنسق غير موجود", 404);

    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      throw new AppError("المبلغ يجب أن يكون رقمًا أكبر من صفر", 400);
    }

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, coordinatorId: coordinator.id, status: OrderStatus.COMPLETED }
      });
      if (!order) {
        throw new AppError("الطلب غير موجود أو ليس مكتملًا أو لا يخصّك", 404);
      }

      const oldAmount = toNum(order.amount);
      if (oldAmount === newAmount) {
        return tx.order.findFirstOrThrow({
          where: { id: orderId },
          include: orderIncludeDriverUser
        });
      }

      const setting = await tx.systemSettings.findFirst({ where: { key: "commission" } });
      if (!setting) throw new AppError("إعدادات العمولة غير موجودة", 400);

      const settingValue = toNum(setting.commissionValue);
      const newCalculated =
        setting.commissionType === CommissionType.PERCENTAGE
          ? (newAmount * settingValue) / 100
          : settingValue;

      const commission = await tx.commission.findUnique({ where: { orderId: order.id } });

      if (commission) {
        const paid = toNum(commission.paidAmount);
        if (paid > 0) {
          throw new AppError("لا يمكن تعديل الأجرة بعد تسديد جزء من عمولة السائق", 400);
        }

        const oldCalculated = toNum(commission.calculatedCommission);
        const dEarnings = newAmount - oldAmount;
        const dCommission = newCalculated - oldCalculated;
        const dAvailable = newAmount - newCalculated - (oldAmount - oldCalculated);

        await tx.commission.update({
          where: { orderId: order.id },
          data: {
            orderAmount: new Prisma.Decimal(newAmount.toFixed(2)),
            commissionType: setting.commissionType,
            commissionValue: setting.commissionValue,
            calculatedCommission: new Prisma.Decimal(newCalculated.toFixed(2)),
            remainingAmount: new Prisma.Decimal(newCalculated.toFixed(2))
          }
        });

        if (order.driverId) {
          const balance = await tx.driverBalance.findUnique({ where: { driverId: order.driverId } });
          if (balance) {
            await tx.driverBalance.update({
              where: { driverId: order.driverId },
              data: {
                totalEarnings: new Prisma.Decimal((toNum(balance.totalEarnings) + dEarnings).toFixed(2)),
                totalCommissions: new Prisma.Decimal((toNum(balance.totalCommissions) + dCommission).toFixed(2)),
                remainingDebt: new Prisma.Decimal((toNum(balance.remainingDebt) + dCommission).toFixed(2)),
                availableBalance: new Prisma.Decimal((toNum(balance.availableBalance) + dAvailable).toFixed(2))
              }
            });
          }

          await tx.financialTransaction.create({
            data: {
              driverId: order.driverId,
              type: FinancialTransactionType.MANUAL_ADJUSTMENT,
              amount: new Prisma.Decimal(dCommission.toFixed(2)),
              notes: `تعديل أجرة الطلب: ${oldAmount} → ${newAmount} (فرق عمولة ${dCommission})`,
              referenceId: order.id
            }
          });
        }
      }

      await tx.order.update({
        where: { id: orderId },
        data: { amount: new Prisma.Decimal(newAmount.toFixed(2)) }
      });

      return tx.order.findFirstOrThrow({
        where: { id: orderId },
        include: orderIncludeDriverUser
      });
    });
  },

  /** قائمة الطلبات للأدمن — جدول مع بحث وفلترة حسب الحالة وترقيم الصفحات */
  async listOrdersForAdminTable(opts?: {
    status?: OrderStatus;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const rawLimit = opts?.limit ?? ADMIN_ORDERS_PAGE_DEFAULT;
    const limit = Math.min(ADMIN_ORDERS_PAGE_MAX, Math.max(1, rawLimit));
    const page = Math.max(1, opts?.page ?? 1);
    const skip = (page - 1) * limit;

    const q = opts?.q?.trim();
    const searchWhere: Prisma.OrderWhereInput | undefined = q
      ? {
          OR: [
            { pickupAddress: { contains: q, mode: "insensitive" } },
            { dropoffAddress: { contains: q, mode: "insensitive" } },
            { coordinator: { user: { fullName: { contains: q, mode: "insensitive" } } } },
            { driver: { user: { fullName: { contains: q, mode: "insensitive" } } } }
          ]
        }
      : undefined;

    const statusWhere: Prisma.OrderWhereInput | undefined =
      opts?.status !== undefined ? { status: opts.status } : undefined;

    const where: Prisma.OrderWhereInput =
      statusWhere && searchWhere
        ? { AND: [statusWhere, searchWhere] }
        : statusWhere ?? searchWhere ?? {};

    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        include: orderIncludeAdmin
      })
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      orders: rows,
      total,
      page,
      limit,
      totalPages
    };
  },

  async orderStatusCountsForAdminTable() {
    const statuses = Object.values(OrderStatus);
    const [all, ...statusCounts] = await Promise.all([
      prisma.order.count(),
      ...statuses.map((status) => prisma.order.count({ where: { status } }))
    ]);
    const byStatus = Object.fromEntries(statuses.map((status, i) => [status, statusCounts[i] ?? 0])) as Record<
      OrderStatus,
      number
    >;
    return { all, byStatus };
  },

  async updateOrderAmountByAdmin(orderId: string, newAmount: number) {
    const order = await prisma.order.findFirst({
      where: { id: orderId },
      include: { coordinator: { select: { userId: true } } }
    });
    if (!order) throw new AppError("الطلب غير موجود", 404);
    await this.updateOrderAmountByCoordinator(order.coordinator.userId, orderId, newAmount);
    return prisma.order.findFirstOrThrow({
      where: { id: orderId },
      include: orderIncludeAdmin
    });
  },

  async deleteOrderByAdmin(orderId: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { commission: true }
      });
      if (!order) throw new AppError("الطلب غير موجود", 404);

      if (order.commission) {
        const paid = toNum(order.commission.paidAmount);
        if (paid > 0) {
          throw new AppError("لا يمكن حذف الطلب بعد تسديد جزء من عمولة السائق", 400);
        }

        if (order.status === OrderStatus.COMPLETED && order.driverId) {
          const amount = toNum(order.amount);
          const commissionAmount = toNum(order.commission.calculatedCommission);
          const balance = await tx.driverBalance.findUnique({ where: { driverId: order.driverId } });
          if (balance) {
            await tx.driverBalance.update({
              where: { driverId: order.driverId },
              data: {
                totalEarnings: new Prisma.Decimal((toNum(balance.totalEarnings) - amount).toFixed(2)),
                totalCommissions: new Prisma.Decimal(
                  (toNum(balance.totalCommissions) - commissionAmount).toFixed(2)
                ),
                remainingDebt: new Prisma.Decimal((toNum(balance.remainingDebt) - commissionAmount).toFixed(2)),
                availableBalance: new Prisma.Decimal(
                  (toNum(balance.availableBalance) - (amount - commissionAmount)).toFixed(2)
                )
              }
            });
          }
        }

        await tx.commissionPayment.deleteMany({ where: { commissionId: order.commission.id } });
        await tx.commission.delete({ where: { orderId } });
      }

      await tx.financialTransaction.deleteMany({ where: { referenceId: orderId } });
      await tx.order.delete({ where: { id: orderId } });

      return { id: orderId };
    });
  }
};

export { orderToSocketPayload } from "./order-socket-payload";
