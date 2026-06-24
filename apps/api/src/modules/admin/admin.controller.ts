import { OrderStatus } from "@prisma/client";
import type { NextFunction, Response } from "express";
import type { Server } from "socket.io";
import type { AuthRequest } from "../../shared/auth";
import { updateCompletedOrderAmountDto, updateOrderDetailsDto } from "../orders/orders.dto";
import {
  ADMIN_ORDERS_PAGE_DEFAULT,
  ADMIN_ORDERS_PAGE_MAX,
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
    segStr === "needs_invoice"
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
  },

  async ordersTable(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const statusRaw = req.query.status;
      const statusStr = typeof statusRaw === "string" ? statusRaw.trim() : "";
      const status =
        statusStr && statusStr !== "ALL" && Object.values(OrderStatus).includes(statusStr as OrderStatus)
          ? (statusStr as OrderStatus)
          : undefined;

      const qRaw = req.query.q;
      const q = typeof qRaw === "string" ? qRaw.trim() : undefined;

      const pageRaw = req.query.page;
      let page: number | undefined;
      if (typeof pageRaw === "string") {
        const parsed = Number.parseInt(pageRaw, 10);
        if (Number.isFinite(parsed)) page = Math.max(1, parsed);
      }

      const limitRaw = req.query.limit;
      let limit: number | undefined;
      if (typeof limitRaw === "string") {
        const parsed = Number.parseInt(limitRaw, 10);
        if (Number.isFinite(parsed)) {
          limit = Math.min(ADMIN_ORDERS_PAGE_MAX, Math.max(1, parsed));
        }
      }

      const result = await ordersService.listOrdersForAdminTable({
        status,
        q: q || undefined,
        page: page ?? 1,
        limit: limit ?? ADMIN_ORDERS_PAGE_DEFAULT
      });

      res.json({
        orders: result.orders.map((o) => ordersService.serializeAdminOrderRow(o)),
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      });
    } catch (err) {
      next(err);
    }
  },

  async ordersTableStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await ordersService.orderStatusCountsForAdminTable();
      res.json(stats);
    } catch (err) {
      next(err);
    }
  },

  async updateOrderAmount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const orderId = req.params.orderId;
      if (!orderId) {
        res.status(400).json({ message: "معرّف الطلب مطلوب" });
        return;
      }
      const parsed = updateCompletedOrderAmountDto.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
        return;
      }
      const updated = await ordersService.updateOrderAmountByAdmin(orderId, parsed.data.amount);
      res.json(ordersService.serializeAdminOrderRow(updated));
    } catch (err) {
      next(err);
    }
  },

  async updateOrderDetails(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const orderId = req.params.orderId;
      if (!orderId) {
        res.status(400).json({ message: "معرّف الطلب مطلوب" });
        return;
      }
      const parsed = updateOrderDetailsDto.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
        return;
      }
      const updated = await ordersService.updateOrderDetailsByAdmin(orderId, parsed.data);
      res.json(ordersService.serializeAdminOrderRow(updated));
    } catch (err) {
      next(err);
    }
  },

  async deleteOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const orderId = req.params.orderId;
      if (!orderId) {
        res.status(400).json({ message: "معرّف الطلب مطلوب" });
        return;
      }
      const result = await ordersService.deleteOrderByAdmin(orderId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
};