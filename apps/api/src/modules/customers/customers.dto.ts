import { z } from "zod";

export const listCustomersQueryDto = z.object({
  filter: z.enum(["all", "most_orders", "inactive"]).optional().default("all"),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(30)
});

export type ListCustomersQuery = z.infer<typeof listCustomersQueryDto>;
