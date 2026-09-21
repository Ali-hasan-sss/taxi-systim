import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { displayCustomerPhone, linkCustomerToNewOrder, normalizeCustomerPhone } from "./customer-phone";
import type { ListCustomerOrdersQuery, ListCustomersQuery } from "./customers.dto";
import { ordersService } from "../orders/orders.service";

const INACTIVE_DAYS = 14;

function inactiveWhere(inactiveBefore: Date): Prisma.CustomerWhereInput {
  return {
    ordersCount: { gt: 10 },
    OR: [{ lastOrderAt: null }, { lastOrderAt: { lte: inactiveBefore } }]
  };
}

function isInactiveCustomer(
  c: { ordersCount: number; lastOrderAt: Date | null },
  inactiveBefore: Date
): boolean {
  if (c.ordersCount <= 10) return false;
  return !c.lastOrderAt || c.lastOrderAt <= inactiveBefore;
}

/**
 * مزامنة زبائن من الطلبات القديمة غير المرتبطة (دفعة واحدة).
 */
async function backfillCustomersFromOrders(batchSize = 800): Promise<number> {
  const unlinked = await prisma.order.findMany({
    where: {
      customerId: null,
      customerPhone: { not: null }
    },
    select: {
      id: true,
      customerPhone: true,
      customerName: true,
      createdAt: true
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: batchSize
  });

  if (unlinked.length === 0) return 0;

  const byPhone = new Map<
    string,
    { orderIds: string[]; name: string | null; count: number; lastAt: Date; firstAt: Date }
  >();

  for (const row of unlinked) {
    const phone = normalizeCustomerPhone(row.customerPhone);
    if (!phone) continue;
    const cur = byPhone.get(phone);
    const nameCandidate =
      row.customerName?.trim() && !/^زبون(\s|$)/.test(row.customerName.trim())
        ? row.customerName.trim()
        : null;
    if (!cur) {
      byPhone.set(phone, {
        orderIds: [row.id],
        name: nameCandidate,
        count: 1,
        lastAt: row.createdAt,
        firstAt: row.createdAt
      });
    } else {
      cur.orderIds.push(row.id);
      cur.count += 1;
      if (row.createdAt > cur.lastAt) cur.lastAt = row.createdAt;
      if (row.createdAt < cur.firstAt) cur.firstAt = row.createdAt;
      if (!cur.name && nameCandidate) cur.name = nameCandidate;
    }
  }

  let linked = 0;
  for (const [phone, group] of byPhone) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({ where: { phone } });
      let customerId: string;
      if (existing) {
        customerId = existing.id;
        await tx.customer.update({
          where: { id: existing.id },
          data: {
            ordersCount: { increment: group.count },
            lastOrderAt:
              !existing.lastOrderAt || group.lastAt > existing.lastOrderAt ? group.lastAt : existing.lastOrderAt,
            ...(existing.name || !group.name ? {} : { name: group.name })
          }
        });
      } else {
        const created = await tx.customer.create({
          data: {
            phone,
            name: group.name,
            ordersCount: group.count,
            lastOrderAt: group.lastAt,
            createdAt: group.firstAt
          }
        });
        customerId = created.id;
      }
      await tx.order.updateMany({
        where: { id: { in: group.orderIds } },
        data: { customerId }
      });
      linked += group.orderIds.length;
    });
  }

  return linked;
}

export const customersService = {
  async list(query: ListCustomersQuery) {
    await backfillCustomersFromOrders(500);

    const limit = Math.min(100, Math.max(1, query.limit ?? 30));
    const page = Math.max(1, query.page ?? 1);
    const skip = (page - 1) * limit;
    const filter = query.filter ?? "all";
    const q = query.q?.trim() || undefined;
    const inactiveBefore = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);

    const searchWhere: Prisma.CustomerWhereInput | undefined = q
      ? {
          OR: [
            { phone: { contains: normalizeCustomerPhone(q) ?? q.replace(/\D/g, "") } },
            { name: { contains: q, mode: "insensitive" } }
          ]
        }
      : undefined;

    const filterWhere: Prisma.CustomerWhereInput =
      filter === "inactive" ? inactiveWhere(inactiveBefore) : {};

    const where: Prisma.CustomerWhereInput = {
      AND: [filterWhere, searchWhere].filter(Boolean) as Prisma.CustomerWhereInput[]
    };

    let orderBy: Prisma.CustomerOrderByWithRelationInput[];
    if (filter === "most_orders") {
      orderBy = [{ ordersCount: "desc" }, { lastOrderAt: "desc" }, { id: "desc" }];
    } else if (filter === "inactive") {
      orderBy = [{ lastContactedAt: { sort: "asc", nulls: "first" } }, { lastOrderAt: "asc" }, { ordersCount: "desc" }, { id: "asc" }];
    } else {
      orderBy = [{ lastOrderAt: "desc" }, { createdAt: "desc" }, { id: "desc" }];
    }

    const [rows, filteredCount, totalAll, inactiveCount, uncontactedInactiveCount] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy,
        skip,
        take: limit
      }),
      prisma.customer.count({ where }),
      prisma.customer.count({ where: searchWhere ?? {} }),
      prisma.customer.count({
        where: {
          AND: [searchWhere ?? {}, inactiveWhere(inactiveBefore)]
        }
      }),
      prisma.customer.count({
        where: {
          AND: [searchWhere ?? {}, inactiveWhere(inactiveBefore), { lastContactedAt: null }]
        }
      })
    ]);

    return {
      filter,
      page,
      limit,
      total: filteredCount,
      totalAll,
      inactiveCount,
      uncontactedInactiveCount,
      hasMore: skip + rows.length < filteredCount,
      customers: rows.map((c) => ({
        id: c.id,
        phone: c.phone,
        phoneDisplay: displayCustomerPhone(c.phone),
        name: c.name,
        ordersCount: c.ordersCount,
        lastOrderAt: c.lastOrderAt?.toISOString() ?? null,
        lastContactedAt: c.lastContactedAt?.toISOString() ?? null,
        needsContact: isInactiveCustomer(c, inactiveBefore) && !c.lastContactedAt,
        createdAt: c.createdAt.toISOString()
      }))
    };
  },

  async listOrders(customerId: string, query: ListCustomerOrdersQuery) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new AppError("الزبون غير موجود", 404);

    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const page = Math.max(1, query.page ?? 1);
    const skip = (page - 1) * limit;
    const q = query.q?.trim();

    const where: Prisma.OrderWhereInput = {
      customerId,
      ...(q
        ? {
            driver: {
              user: { fullName: { contains: q, mode: "insensitive" } }
            }
          }
        : {})
    };

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        include: {
          driver: { include: { user: { select: { fullName: true, phone: true } } } },
          coordinator: { include: { user: { select: { fullName: true } } } }
        }
      }),
      prisma.order.count({ where })
    ]);

    return {
      customer: {
        id: customer.id,
        phone: customer.phone,
        phoneDisplay: displayCustomerPhone(customer.phone),
        name: customer.name,
        ordersCount: customer.ordersCount,
        lastOrderAt: customer.lastOrderAt?.toISOString() ?? null,
        createdAt: customer.createdAt.toISOString()
      },
      page,
      limit,
      total,
      hasMore: skip + rows.length < total,
      orders: rows.map((row) => ({
        ...ordersService.serializeCoordinatorOrderRow(row),
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
        startedAt: row.startedAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        originalAmount: row.originalAmount?.toString() ?? null,
        discountAmount: row.discountAmount.toString()
      }))
    };
  },

  async markContacted(customerId: string) {
    const existing = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!existing) throw new AppError("الزبون غير موجود", 404);
    const row = await prisma.customer.update({
      where: { id: customerId },
      data: { lastContactedAt: new Date() }
    });
    const inactiveBefore = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);
    return {
      id: row.id,
      lastContactedAt: row.lastContactedAt?.toISOString() ?? null,
      needsContact: isInactiveCustomer(row, inactiveBefore) && !row.lastContactedAt
    };
  },

  linkCustomerToNewOrder
};
