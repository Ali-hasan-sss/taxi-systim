import type { NextFunction, Response } from "express";
import type { Server } from "socket.io";
import type { AuthRequest } from "../../shared/auth";
import {
  ADMIN_ORDERS_ROOM_PAGE_DEFAULT,
  ADMIN_ORDERS_ROOM_PAGE_MAX,
  ordersService,
  type CoordinatorOrdersListSegment
} from "../orders/orders.service";
import { adminService } from "./admin.service";

function parseAdminOrdersSegment(raw: unknown): CoordinatorOrdersListSegment | undefined {
  const segStr = Array.isArray(raw) ? raw[0] : raw;
  if (typeof segStr !== "string") return undefined;
  if (
    segStr === "pending" ||
    segStr === "in_progress" ||
    segStr === "stuck" ||
    segStr === "needs_info" ||
    segStr === "needs_invoice" ||
    segStr === "completed"
  ) {
    return segStr;
  }
  return undefined;
}

export const adminController = {
  async dashboardStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const io = req.app.get("io") as Server | undefined;
      const stats = await adminService.dashboardStats(io);
      res.json(stats);
    } catch (err) {
      next(err);
    }
  },

  async ordersRoom(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const segment = parseAdminOrdersSegment(req.query.segment);
      const cursorRaw = req.query.cursor;
      const cursor = typeof cursorRaw === "string" && cursorRaw.trim() ? cursorRaw.trim() : undefined;
      const limitRaw = req.query.limit;
      let limit: number | undefined;
      if (typeof limitRaw === "string") {
        const parsed = Number.parseInt(limitRaw, 10);
        if (Number.isFinite(parsed)) {
          limit = Math.min(ADMIN_ORDERS_ROOM_PAGE_MAX, Math.max(1, parsed));
        }
      }
      const { orders, nextCursor } = await ordersService.listForAdmin({
        activeSegment: segment,
        cursor,
        limit: limit ?? ADMIN_ORDERS_ROOM_PAGE_DEFAULT
      });
      res.json({
        orders: orders.map((o) => ordersService.serializeAdminOrderRow(o)),
        nextCursor
      });
    } catch (err) {
      next(err);
    }
  },

  async ordersRoomStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await ordersService.orderStatsForAdmin();
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }
};