import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { displayCustomerPhone, linkCustomerToNewOrder, normalizeCustomerPhone } from "./customer-phone";
import type { ListCustomersQuery } from "./customers.dto";

const INACTIVE_DAYS = 14;

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
      filter === "inactive"
        ? {
            ordersCount: { gt: 10 },
            OR: [{ lastOrderAt: null }, { lastOrderAt: { lte: inactiveBefore } }]
          }
        : {};

    const where: Prisma.CustomerWhereInput = {
      AND: [filterWhere, searchWhere].filter(Boolean) as Prisma.CustomerWhereInput[]
    };

    let orderBy: Prisma.CustomerOrderByWithRelationInput[];
    if (filter === "most_orders") {
      orderBy = [{ ordersCount: "desc" }, { lastOrderAt: "desc" }, { id: "desc" }];
    } else if (filter === "inactive") {
      orderBy = [{ lastOrderAt: "asc" }, { ordersCount: "desc" }, { id: "asc" }];
    } else {
      orderBy = [{ lastOrderAt: "desc" }, { createdAt: "desc" }, { id: "desc" }];
    }

    const [rows, filteredCount, totalAll, inactiveCount] = await Promise.all([
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
          AND: [
            searchWhere ?? {},
            {
              ordersCount: { gt: 10 },
              OR: [{ lastOrderAt: null }, { lastOrderAt: { lte: inactiveBefore } }]
            }
          ]
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
      hasMore: skip + rows.length < filteredCount,
      customers: rows.map((c) => ({
        id: c.id,
        phone: c.phone,
        phoneDisplay: displayCustomerPhone(c.phone),
        name: c.name,
        ordersCount: c.ordersCount,
        lastOrderAt: c.lastOrderAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString()
      }))
    };
  },

  linkCustomerToNewOrder
};
