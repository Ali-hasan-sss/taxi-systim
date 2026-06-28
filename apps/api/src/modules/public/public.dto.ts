import { z } from "zod";

export const publicTaxiRequestDto = z.object({
  customerPhone: z.string().trim().min(3, "رقم الهاتف مطلوب"),
  pickupAddress: z.string().trim().min(2, "عنوان الانطلاق مطلوب"),
  dropoffAddress: z.string().trim().min(2, "عنوان الوجهة مطلوب"),
  notes: z.string().trim().max(2000).optional(),
  customerName: z.string().trim().min(2).optional()
});

export type PublicTaxiRequestDto = z.infer<typeof publicTaxiRequestDto>;

export const publishWebInquiryDto = z.object({
  amount: z.number().positive().optional(),
  vehicleRequirement: z.enum(["ANY", "PUBLIC", "PRIVATE", "VIP"]).optional(),
  broadcastTarget: z.enum(["ALL", "NEAREST_THREE"]).optional(),
  pickupLat: z.number().finite().optional(),
  pickupLng: z.number().finite().optional()
});

export type PublishWebInquiryDto = z.infer<typeof publishWebInquiryDto>;
