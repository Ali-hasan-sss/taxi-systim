import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../shared/auth";
import { driversService } from "./drivers.service";

function queryParamQ(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return undefined;
}

export const driversController = {
  async me(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await driversService.profileForDriver(req.auth!.userId);
      res.json(profile);
    } catch (e) {
      next(e);
    }
  },

  async forAssignment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const q = queryParamQ(req.query.q);
      const drivers = await driversService.listForAssignment(q);
      res.json({ drivers });
    } catch (e) {
      next(e);
    }
  },

  async live(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const drivers = await driversService.listLiveWithNames();
      res.json({ drivers });
    } catch (e) {
      next(e);
    }
  }
};
