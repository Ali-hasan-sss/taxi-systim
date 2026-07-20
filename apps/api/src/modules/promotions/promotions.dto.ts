import { z } from "zod";
import { PromotionChannel, PromotionRewardType } from "@prisma/client";

const promotionFields = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  channel: z.nativeEnum(PromotionChannel),
  rewardType: z.nativeEnum(PromotionRewardType),
  ordersThreshold: z.number().int().positive().max(1000),
  discountAmount: z.number().positive().optional(),
  code: z.string().trim().min(2).max(40).optional(),
  isActive: z.boolean().optional().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable()
});

function refinePromotion(
  data: {
    channel: PromotionChannel;
    rewardType: PromotionRewardType;
    discountAmount?: number;
    code?: string;
  },
  ctx: z.RefinementCtx
) {
  if (data.channel === PromotionChannel.WEB_LINK && !data.code?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "رمز العرض مطلوب لعروض رابط الويب", path: ["code"] });
  }
  if (data.rewardType === PromotionRewardType.FIXED_DISCOUNT) {
    if (!(data.discountAmount != null && data.discountAmount > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "أدخل مبلغ الخصم",
        path: ["discountAmount"]
      });
    }
  }
}

export const createPromotionDto = promotionFields.superRefine(refinePromotion);

export const updatePromotionDto = promotionFields.partial().superRefine((data, ctx) => {
  if (data.channel === PromotionChannel.WEB_LINK && data.code !== undefined && !data.code?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "رمز العرض مطلوب لعروض رابط الويب", path: ["code"] });
  }
  if (data.rewardType === PromotionRewardType.FIXED_DISCOUNT && data.discountAmount !== undefined) {
    if (!(data.discountAmount > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "أدخل مبلغ الخصم", path: ["discountAmount"] });
    }
  }
});

export type CreatePromotionDto = z.infer<typeof createPromotionDto>;
export type UpdatePromotionDto = z.infer<typeof updatePromotionDto>;
