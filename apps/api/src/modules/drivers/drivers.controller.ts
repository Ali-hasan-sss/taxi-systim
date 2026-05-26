import type { NextFunction, Response } from "express";
import type { Server } from "socket.io";
import type { AuthRequest } from "../../shared/auth";
import { driversService, type LiveDriversStatusFilter } from "./drivers.service";

function queryParamQ(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return undefined;
}

function queryParamInt(raw: unknown): number | undefined {
  const value = queryParamQ(raw);
  if (typeof value !== "string") return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function queryParamStatus(raw: unknown): LiveDriversStatusFilter | undefined {
  const value = queryParamQ(raw);
  if (value === "all" || value === "available" || value === "busy") {
    return value;
  }
  return undefined;
}

function queryParamBool(raw: unknown): boolean | undefined {
  const value = queryParamQ(raw);
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
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
      const io = req.app.get("io") as Server | undefined;
      if (!io) {
        res.json({ drivers: [], total: 0, nextOffset: null });
        return;
      }
      const q = queryParamQ(req.query.q);
      const limit = queryParamInt(req.query.limit);
      const offset = queryParamInt(req.query.offset);
      const status = queryParamStatus(req.query.status);
      const includeInactive = queryParamBool(req.query.includeInactive);
      const page = await driversService.listLiveWithNames(io, { q, limit, offset, status, includeInactive });
      res.json(page);
    } catch (e) {
      next(e);
    }
  }
};
