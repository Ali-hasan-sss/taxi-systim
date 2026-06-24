import { z } from "zod";
import { OrderBroadcastTarget, OrderVehicleRequirement } from "@prisma/client";

export const createOrderDto = z
  .object({
    customerName: z.string().min(2).optional(),
    customerPhone: z.string().min(3).optional(),
    pickupAddress: z.string().min(2),
    dropoffAddress: z.string().min(2),
    amount: z.number().positive(),
    notes: z.string().max(2000).optional(),
    vehicleRequirement: z.nativeEnum(OrderVehicleRequirement).default(OrderVehicleRequirement.ANY),
    broadcastTarget: z.nativeEnum(OrderBroadcastTarget).default(OrderBroadcastTarget.ALL),
    pickupLat: z.number().finite().optional(),
    pickupLng: z.number().finite().optional()
  })
  .superRefine((data, ctx) => {
    if (data.broadcastTarget === OrderBroadcastTarget.NEAREST_THREE) {
      if (data.pickupLat === undefined || data.pickupLng === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "pickupLat و pickupLng مطلوبان لإرسال الطلب لأقرب 3 سائقين"
        });
      }
    }
    const hasName = data.customerName && data.customerName.length >= 2;
    const hasPhone = data.customerPhone && data.customerPhone.length >= 3;
    if (!hasName && !hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "أدخل اسم الزبون أو رقم الهاتف على الأقل"
      });
    }
  });

export type CreateOrderDto = z.infer<typeof createOrderDto>;

export const assignOrderDto = z.object({
  driverId: z.string().min(1, "معرّف السائق مطلوب")
});

export type AssignOrderDto = z.infer<typeof assignOrderDto>;

export const updateCompletedOrderAmountDto = z.object({
  amount: z.number().positive()
});

export type UpdateCompletedOrderAmountDto = z.infer<typeof updateCompletedOrderAmountDto>;

export const updateOrderDetailsDto = z
  .object({
    customerName: z.string().trim().min(2).optional(),
    customerPhone: z.string().trim().min(3).optional(),
    pickupAddress: z.string().trim().min(2).optional(),
    dropoffAddress: z.string().trim().min(2).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "أدخل حقلًا واحدًا على الأقل للتعديل"
  });

export type UpdateOrderDetailsDto = z.infer<typeof updateOrderDetailsDto>;
