import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../shared/auth";
import { createPromotionDto, updatePromotionDto } from "./promotions.dto";
import { promotionsService } from "./promotions.service";

export const promotionsController = {
  async list(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(await promotionsService.list());
    } catch (e) {
      next(e);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = createPromotionDto.parse(req.body);
      const row = await promotionsService.create(dto, req.auth!.userId);
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = updatePromotionDto.parse(req.body);
      const row = await promotionsService.update(req.params.id, dto);
      res.json(row);
    } catch (e) {
      next(e);
    }
  },

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(await promotionsService.remove(req.params.id));
    } catch (e) {
      next(e);
    }
  }
};
