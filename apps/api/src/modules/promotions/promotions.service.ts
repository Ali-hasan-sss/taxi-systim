import { Prisma, PromotionChannel, PromotionRewardType } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import type { CreatePromotionDto, UpdatePromotionDto } from "./promotions.dto";

function serializePromotion(row: {
  id: string;
  title: string;
  description: string | null;
  channel: PromotionChannel;
  rewardType: PromotionRewardType;
  ordersThreshold: number;
  discountAmount: Prisma.Decimal | null;
  code: string | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { redemptions: number };
}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    channel: row.channel,
    rewardType: row.rewardType,
    ordersThreshold: row.ordersThreshold,
    discountAmount: row.discountAmount?.toString() ?? null,
    code: row.code,
    isActive: row.isActive,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    redemptionsCount: row._count?.redemptions ?? 0,
    webBookPath: row.channel === PromotionChannel.WEB_LINK && row.code ? `/book?promo=${encodeURIComponent(row.code)}` : null
  };
}

export const promotionsService = {
  async list() {
    const rows = await prisma.promotion.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { redemptions: true } } }
    });
    return { promotions: rows.map(serializePromotion) };
  },

  async create(dto: CreatePromotionDto, adminUserId: string) {
    if (dto.channel === PromotionChannel.WEB_LINK) {
      const code = dto.code!.trim().toUpperCase();
      const exists = await prisma.promotion.findFirst({
        where: { code: { equals: code, mode: "insensitive" } }
      });
      if (exists) throw new AppError("رمز العرض مستخدم مسبقًا", 409);
    }

    const row = await prisma.promotion.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        channel: dto.channel,
        rewardType: dto.rewardType,
        ordersThreshold: dto.ordersThreshold,
        discountAmount:
          dto.rewardType === PromotionRewardType.FIXED_DISCOUNT && dto.discountAmount != null
            ? new Prisma.Decimal(dto.discountAmount.toFixed(2))
            : null,
        code: dto.channel === PromotionChannel.WEB_LINK ? dto.code!.trim().toUpperCase() : null,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        createdByUserId: adminUserId
      },
      include: { _count: { select: { redemptions: true } } }
    });
    return serializePromotion(row);
  },

  async update(id: string, dto: UpdatePromotionDto) {
    const existing = await prisma.promotion.findUnique({ where: { id } });
    if (!existing) throw new AppError("العرض غير موجود", 404);

    const channel = dto.channel ?? existing.channel;
    const rewardType = dto.rewardType ?? existing.rewardType;
    const codeRaw = dto.code !== undefined ? dto.code : existing.code;
    if (channel === PromotionChannel.WEB_LINK && !codeRaw?.trim()) {
      throw new AppError("رمز العرض مطلوب لعروض رابط الويب", 400);
    }
    if (rewardType === PromotionRewardType.FIXED_DISCOUNT) {
      const amount = dto.discountAmount ?? (existing.discountAmount ? Number(existing.discountAmount) : null);
      if (!(amount != null && amount > 0)) throw new AppError("أدخل مبلغ الخصم", 400);
    }

    if (channel === PromotionChannel.WEB_LINK && codeRaw) {
      const code = codeRaw.trim().toUpperCase();
      const clash = await prisma.promotion.findFirst({
        where: { code: { equals: code, mode: "insensitive" }, NOT: { id } }
      });
      if (clash) throw new AppError("رمز العرض مستخدم مسبقًا", 409);
    }

    const row = await prisma.promotion.update({
      where: { id },
      data: {
        ...(dto.title != null ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.channel != null ? { channel: dto.channel } : {}),
        ...(dto.rewardType != null ? { rewardType: dto.rewardType } : {}),
        ...(dto.ordersThreshold != null ? { ordersThreshold: dto.ordersThreshold } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
        discountAmount:
          rewardType === PromotionRewardType.FREE_ORDER
            ? null
            : dto.discountAmount != null
              ? new Prisma.Decimal(dto.discountAmount.toFixed(2))
              : undefined,
        code: channel === PromotionChannel.WEB_LINK ? (codeRaw?.trim().toUpperCase() ?? null) : null
      },
      include: { _count: { select: { redemptions: true } } }
    });
    return serializePromotion(row);
  },

  async remove(id: string) {
    const existing = await prisma.promotion.findUnique({ where: { id } });
    if (!existing) throw new AppError("العرض غير موجود", 404);
    await prisma.promotion.delete({ where: { id } });
    return { ok: true };
  }
};
