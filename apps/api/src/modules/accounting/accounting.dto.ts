import { z } from "zod";

export const recordPaymentDto = z.object({
  commissionId: z.string().cuid(),
  amount: z.number().positive(),
  notes: z.string().optional()
});
