import type { NextFunction, Response } from "express";
import type { Server } from "socket.io";
import { assignOrderDto, createOrderDto } from "./orders.dto";
import {
  COORDINATOR_ORDERS_PAGE_DEFAULT,
  COORDINATOR_ORDERS_PAGE_MAX,
  ordersService
} from "./orders.service";
import type { AuthRequest } from "../../shared/auth";
import { broadcastNewOrder, emitOrderAssigned } from "../../socket";

export const ordersController = {
  async listMine(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const raw = req.query.scope;
      const scope = raw === "archive" ? "archive" : "active";
      const limitRaw = req.query.limit;
      const limitStr = Array.isArray(limitRaw) ? limitRaw[0] : limitRaw;
      let limit = COORDINATOR_ORDERS_PAGE_DEFAULT;
      if (typeof limitStr === "string") {
        const n = parseInt(limitStr, 10);
        if (!Number.isNaN(n)) {
          limit = Math.min(COORDINATOR_ORDERS_PAGE_MAX, Math.max(1, n));
        }
      }
      const cursorRaw = req.query.cursor;
      const cursorSingle =
        typeof cursorRaw === "string"
          ? cursorRaw
          : Array.isArray(cursorRaw) && typeof cursorRaw[0] === "string"
            ? cursorRaw[0]
            : undefined;
      const cursor = cursorSingle && cursorSingle.length > 0 ? cursorSingle : undefined;
      const { orders, nextCursor } = await ordersService.listForCoordinator(req.auth!.userId, scope, {
        limit,
        cursor
      });
      res.json({ orders, nextCursor });
    } catch (e) {
      next(e);
    }
  },

  async driverOrderStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await ordersService.orderStatsForDriver(req.auth!.userId);
      res.json(stats);
    } catch (e) {
      next(e);
    }
  },

  async coordinatorOrderStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await ordersService.orderStatsForCoordinator(req.auth!.userId);
      res.json(stats);
    } catch (e) {
      next(e);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = createOrderDto.parse(req.body);
      const order = await ordersService.createOrder(req.auth!.userId, dto);
      const io = req.app.get("io") as Server | undefined;
      if (io) await broadcastNewOrder(io, order);
      res.status(201).json(order);
    } catch (e) {
      next(e);
    }
  },
  async complete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await ordersService.completeOrder(req.params.orderId);
      res.json(order);
    } catch (e) {
      next(e);
    }
  },

  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await ordersService.cancelByCoordinator(req.auth!.userId, req.params.orderId);
      res.json(order);
    } catch (e) {
      next(e);
    }
  },

  async assign(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const body = assignOrderDto.parse(req.body);
      const order = await ordersService.assignByCoordinator(req.auth!.userId, req.params.orderId, body.driverId);
      const io = req.app.get("io") as Server | undefined;
      if (io) emitOrderAssigned(io, order);
      res.json(order);
    } catch (e) {
      next(e);
    }
  }
};
