import { z } from "zod";

export const sendMessageDto = z.object({
  body: z.string().trim().min(1).max(4000)
});

export const listMessagesQueryDto = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const listRoomsQueryDto = z.object({
  scope: z.enum(["active", "archived"]).optional(),
  q: z.string().trim().max(120).optional()
});
