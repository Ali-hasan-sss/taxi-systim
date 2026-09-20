import type { NextFunction, Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../../shared/auth";
import { notificationsService } from "./notifications.service";

const markReadDto = z.object({
  ids: z.array(z.string().min(1)).optional()
});

export const notificationsController = {
  async listMine(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await notificationsService.listMine(req.auth!.userId);
      res.json(result);
    } catch (e) {
      next(e);
    }
  },

  async markRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = markReadDto.parse(req.body ?? {});
      const result = await notificationsService.markRead(req.auth!.userId, dto.ids);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }
};
