import { Prisma, PromotionChannel, PromotionRewardType, type Promotion } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";

const toNum = (d: Prisma.Decimal | number) => Number(d);

type Tx = Prisma.TransactionClient;

function isPromotionLive(promo: Promotion, now = new Date()): boolean {
  if (!promo.isActive) return false;
  if (promo.startsAt && promo.startsAt > now) return false;
  if (promo.endsAt && promo.endsAt < now) return false;
  return true;
}

export function computePromotionDiscount(
  promo: Pick<Promotion, "rewardType" | "discountAmount">,
  orderAmount: number
): number {
  if (!(orderAmount > 0)) return 0;
  if (promo.rewardType === PromotionRewardType.FREE_ORDER) {
    return orderAmount;
  }
  const fixed = toNum(promo.discountAmount ?? 0);
  if (!(fixed > 0)) return 0;
  return Math.min(orderAmount, fixed);
}

/**
 * اختيار عرض مؤهل: كل N طلبات (ordersCount بعد الربط).
 * WEB_LINK يتطلب رمزًا مطابقًا وقناة ويب.
 */
export async function findEligiblePromotion(
  tx: Tx,
  opts: {
    customerId: string | null;
    ordersCount: number;
    channel: "WEB" | "APP";
    promoCode?: string | null;
  }
): Promise<Promotion | null> {
  if (!opts.customerId || opts.ordersCount <= 0) return null;

  const now = new Date();
  const code = opts.promoCode?.trim().toUpperCase() || null;

  if (opts.channel === "WEB" && code) {
    const webPromo = await tx.promotion.findFirst({
      where: {
        channel: PromotionChannel.WEB_LINK,
        isActive: true,
        code: { equals: code, mode: "insensitive" }
      }
    });
    if (
      webPromo &&
      isPromotionLive(webPromo, now) &&
      webPromo.ordersThreshold > 0 &&
      opts.ordersCount % webPromo.ordersThreshold === 0
    ) {
      const already = await tx.promotionRedemption.findFirst({
        where: {
          promotionId: webPromo.id,
          customerId: opts.customerId,
          milestoneCount: opts.ordersCount
        }
      });
      if (!already) return webPromo;
    }
  }

  const loyalty = await tx.promotion.findMany({
    where: {
      channel: PromotionChannel.LOYALTY,
      isActive: true
    },
    orderBy: [{ createdAt: "desc" }]
  });

  for (const promo of loyalty) {
    if (!isPromotionLive(promo, now)) continue;
    if (promo.ordersThreshold <= 0) continue;
    if (opts.ordersCount % promo.ordersThreshold !== 0) continue;
    const already = await tx.promotionRedemption.findFirst({
      where: {
        promotionId: promo.id,
        customerId: opts.customerId,
        milestoneCount: opts.ordersCount
      }
    });
    if (!already) return promo;
  }

  return null;
}

export async function attachPromotionToOrder(
  tx: Tx,
  opts: {
    orderId: string;
    customerId: string;
    promotion: Promotion;
    orderAmount: number;
    milestoneCount: number;
  }
): Promise<{ amount: number; discountAmount: number; originalAmount: number }> {
  const originalAmount = opts.orderAmount;
  const discountAmount = computePromotionDiscount(opts.promotion, originalAmount);
  const amount = Math.max(0, originalAmount - discountAmount);

  await tx.order.update({
    where: { id: opts.orderId },
    data: {
      promotionId: opts.promotion.id,
      originalAmount: new Prisma.Decimal(originalAmount.toFixed(2)),
      discountAmount: new Prisma.Decimal(discountAmount.toFixed(2)),
      amount: new Prisma.Decimal(amount.toFixed(2))
    }
  });

  if (discountAmount > 0) {
    await tx.promotionRedemption.create({
      data: {
        promotionId: opts.promotion.id,
        customerId: opts.customerId,
        orderId: opts.orderId,
        discountAmount: new Prisma.Decimal(discountAmount.toFixed(2)),
        milestoneCount: opts.milestoneCount
      }
    });
  } else {
    // ما زال العرض مربوطًا حتى لو الخصم 0 (أجرة غير محددة بعد — ويب)
    await tx.order.update({
      where: { id: opts.orderId },
      data: { promotionId: opts.promotion.id }
    });
  }

  return { amount, discountAmount, originalAmount };
}

/**
 * عند نشر طلب ويب أصبح له أجرة: طبّق الخصم إن وُجد عرض معلّق.
 */
export async function applyPendingPromotionOnAmount(
  tx: Tx,
  opts: { orderId: string; amount: number }
): Promise<{ amount: number; discountAmount: number }> {
  const order = await tx.order.findUnique({
    where: { id: opts.orderId },
    include: { promotion: true, promoRedemption: true, customer: true }
  });
  if (!order?.promotionId || !order.promotion || !order.customerId) {
    return { amount: opts.amount, discountAmount: 0 };
  }
  if (!isPromotionLive(order.promotion)) {
    return { amount: opts.amount, discountAmount: 0 };
  }

  const originalAmount = opts.amount;
  const discountAmount = computePromotionDiscount(order.promotion, originalAmount);
  const amount = Math.max(0, originalAmount - discountAmount);

  await tx.order.update({
    where: { id: opts.orderId },
    data: {
      originalAmount: new Prisma.Decimal(originalAmount.toFixed(2)),
      discountAmount: new Prisma.Decimal(discountAmount.toFixed(2)),
      amount: new Prisma.Decimal(amount.toFixed(2))
    }
  });

  if (discountAmount > 0) {
    if (order.promoRedemption) {
      await tx.promotionRedemption.update({
        where: { id: order.promoRedemption.id },
        data: { discountAmount: new Prisma.Decimal(discountAmount.toFixed(2)) }
      });
    } else {
      const milestone =
        order.customer?.ordersCount && order.customer.ordersCount > 0
          ? order.customer.ordersCount
          : 1;
      await tx.promotionRedemption.create({
        data: {
          promotionId: order.promotionId,
          customerId: order.customerId,
          orderId: order.id,
          discountAmount: new Prisma.Decimal(discountAmount.toFixed(2)),
          milestoneCount: milestone
        }
      });
    }
  }

  return { amount, discountAmount };
}

/**
 * تعويض السائق بقيمة خصم الزبون (لا يشترط وجود دين سابق).
 */
export async function compensateDriverForPromoDiscount(
  tx: Tx,
  opts: {
    orderId: string;
    driverId: string;
    discountAmount: number;
    promotionTitle?: string | null;
    adminUserId?: string | null;
  }
) {
  const amount = opts.discountAmount;
  if (!(amount > 0)) return;

  const order = await tx.order.findUnique({
    where: { id: opts.orderId },
    select: { promoCompensatedAt: true, discountAmount: true }
  });
  if (!order || order.promoCompensatedAt) return;

  const notes = opts.promotionTitle?.trim()
    ? `تعويض سائق: عرض من المدير — ${opts.promotionTitle.trim()}`
    : "تعويض سائق: عرض من المدير";

  const balance =
    (await tx.driverBalance.findUnique({ where: { driverId: opts.driverId } })) ??
    (await tx.driverBalance.create({ data: { driverId: opts.driverId } }));

  await tx.driverBalance.update({
    where: { driverId: opts.driverId },
    data: {
      remainingDebt: new Prisma.Decimal(Math.max(0, toNum(balance.remainingDebt) - amount).toFixed(2)),
      availableBalance: new Prisma.Decimal((toNum(balance.availableBalance) + amount).toFixed(2))
    }
  });

  await tx.financialTransaction.create({
    data: {
      driverId: opts.driverId,
      type: "MANUAL_ADJUSTMENT",
      amount: new Prisma.Decimal(amount.toFixed(2)),
      referenceId: opts.orderId,
      notes,
      createdByUserId: opts.adminUserId ?? undefined
    }
  });

  await tx.order.update({
    where: { id: opts.orderId },
    data: { promoCompensatedAt: new Date() }
  });
}

export async function getCustomerOrdersCount(tx: Tx, customerId: string): Promise<number> {
  const row = await tx.customer.findUnique({
    where: { id: customerId },
    select: { ordersCount: true }
  });
  return row?.ordersCount ?? 0;
}
