import type { NextFunction, Response } from "express";
import type { Server } from "socket.io";
import { OrderStatus } from "@prisma/client";
import {
  notifyCoordinatorOrderAcceptedPush,
  notifyCoordinatorOrderCompletedPush,
  notifyCoordinatorOrderStuckPush,
  notifyDriversNewOrderPush
} from "../../shared/expo-push";
import { assignOrderDto, createOrderDto, updateCompletedOrderAmountDto } from "./orders.dto";
import {
  COORDINATOR_ORDERS_PAGE_DEFAULT,
  COORDINATOR_ORDERS_PAGE_MAX,
  DRIVER_REPORTS_PAGE_DEFAULT,
  DRIVER_REPORTS_PAGE_MAX,
  ordersService
} from "./orders.service";
import type { AuthRequest } from "../../shared/auth";
import {
  broadcastNewOrder,
  emitDriverClaimedOrder,
  emitOrderAssigned,
  emitOrderStatusUpdated,
  emitPendingOrderCancelled
} from "../../socket";

export const ordersController = {
  async report(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const limitRaw = req.query.limit;
      const limitStr = Array.isArray(limitRaw) ? limitRaw[0] : limitRaw;
      let limit = COORDINATOR_ORDERS_PAGE_DEFAULT;
      if (typeof limitStr === "string") {
        const n = parseInt(limitStr, 10);
        if (!Number.isNaN(n)) {
          limit = Math.max(1, n);
        }
      }
      const cursorRaw = req.query.cursor;
      const cursorSingle =
        typeof cursorRaw === "string"
          ? cursorRaw
          : Array.isArray(cursorRaw) && typeof cursorRaw[0] === "string"
            ? cursorRaw[0]
            : undefined;
      const fromRaw = req.query.from;
      const from =
        typeof fromRaw === "string"
          ? fromRaw
          : Array.isArray(fromRaw) && typeof fromRaw[0] === "string"
            ? fromRaw[0]
            : undefined;
      const toRaw = req.query.to;
      const to =
        typeof toRaw === "string"
          ? toRaw
          : Array.isArray(toRaw) && typeof toRaw[0] === "string"
            ? toRaw[0]
            : undefined;
      const driverRaw = req.query.driverId;
      const driverId =
        typeof driverRaw === "string"
          ? driverRaw
          : Array.isArray(driverRaw) && typeof driverRaw[0] === "string"
            ? driverRaw[0]
            : undefined;

      const page = await ordersService.reportForCoordinator(req.auth!.userId, {
        from,
        to,
        driverId,
        cursor: cursorSingle,
        limit
      });
      res.json({
        orders: page.orders.map((o) => ordersService.serializeCoordinatorOrderRow(o)),
        nextCursor: page.nextCursor,
        summary: page.summary
      });
    } catch (e) {
      next(e);
    }
  },

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
      const segRaw = req.query.segment;
      const segStr = Array.isArray(segRaw) ? segRaw[0] : segRaw;
      let activeSegment: "pending" | "in_progress" | "stuck" | undefined;
      let archiveSegment: "completed" | "cancelled" | undefined;
      if (scope === "active" && typeof segStr === "string") {
        if (segStr === "pending" || segStr === "in_progress" || segStr === "stuck") {
          activeSegment = segStr;
        }
      } else if (scope === "archive" && typeof segStr === "string") {
        if (segStr === "completed" || segStr === "cancelled") {
          archiveSegment = segStr;
        }
      }
      const { orders, nextCursor } = await ordersService.listForCoordinator(req.auth!.userId, scope, {
        limit,
        cursor,
        activeSegment,
        archiveSegment
      });
      res.json({
        orders: orders.map((o) => ordersService.serializeCoordinatorOrderRow(o)),
        nextCursor
      });
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

  async driverReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const limitRaw = req.query.limit;
      const limitStr = Array.isArray(limitRaw) ? limitRaw[0] : limitRaw;
      let limit = DRIVER_REPORTS_PAGE_DEFAULT;
      if (typeof limitStr === "string") {
        const n = parseInt(limitStr, 10);
        if (!Number.isNaN(n)) {
          limit = Math.min(DRIVER_REPORTS_PAGE_MAX, Math.max(1, n));
        }
      }
      const cursorRaw = req.query.cursor;
      const cursorSingle =
        typeof cursorRaw === "string"
          ? cursorRaw
          : Array.isArray(cursorRaw) && typeof cursorRaw[0] === "string"
            ? cursorRaw[0]
            : undefined;
      const fromRaw = req.query.from;
      const from =
        typeof fromRaw === "string"
          ? fromRaw
          : Array.isArray(fromRaw) && typeof fromRaw[0] === "string"
            ? fromRaw[0]
            : undefined;
      const toRaw = req.query.to;
      const to =
        typeof toRaw === "string"
          ? toRaw
          : Array.isArray(toRaw) && typeof toRaw[0] === "string"
            ? toRaw[0]
            : undefined;

      const page = await ordersService.reportForDriver(req.auth!.userId, {
        from,
        to,
        cursor: cursorSingle,
        limit
      });
      res.json(page);
    } catch (e) {
      next(e);
    }
  },

  async driverOrderRoom(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { inProgress, pending } = await ordersService.driverOrderRoom(req.auth!.userId);
      res.json({
        inProgress: inProgress ? ordersService.serializeDriverOrderRow(inProgress) : null,
        pending: pending.map((o) => ordersService.serializeDriverOrderRow(o))
      });
    } catch (e) {
      next(e);
    }
  },

  async acceptByDriver(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await ordersService.acceptOrderByDriver(req.auth!.userId, req.params.orderId);
      const io = req.app.get("io") as Server | undefined;
      if (io) emitDriverClaimedOrder(io, order);
      void notifyCoordinatorOrderAcceptedPush(order.id);
      res.json(ordersService.serializeDriverOrderRow(order));
    } catch (e) {
      next(e);
    }
  },

  async listDriverOrders(req: AuthRequest, res: Response, next: NextFunction) {
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
      const segRaw = req.query.archiveSegment;
      const segStr = Array.isArray(segRaw) ? segRaw[0] : segRaw;
      let archiveSegment: "completed" | "cancelled" | "stuck" | undefined;
      if (scope === "archive" && typeof segStr === "string") {
        if (segStr === "completed" || segStr === "cancelled" || segStr === "stuck") {
          archiveSegment = segStr;
        }
      }
      const { orders, nextCursor } = await ordersService.listForDriver(req.auth!.userId, scope, {
        limit,
        cursor,
        archiveSegment
      });
      res.json({
        orders: orders.map((o) => ordersService.serializeDriverOrderRow(o)),
        nextCursor
      });
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
      void notifyDriversNewOrderPush(order);
      res.status(201).json(order);
    } catch (e) {
      next(e);
    }
  },
  async boardCustomer(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await ordersService.markCustomerBoardedByDriver(req.auth!.userId, req.params.orderId);
      const io = req.app.get("io") as Server | undefined;
      if (io) emitOrderStatusUpdated(io, order);
      res.json(ordersService.serializeDriverOrderRow(order));
    } catch (e) {
      next(e);
    }
  },

  async reportCustomerNoShow(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await ordersService.reportCustomerNoShowByDriver(req.auth!.userId, req.params.orderId);
      const io = req.app.get("io") as Server | undefined;
      if (io) emitOrderStatusUpdated(io, order);
      if (order.status === OrderStatus.STUCK) void notifyCoordinatorOrderStuckPush(order);
      res.json(ordersService.serializeDriverOrderRow(order));
    } catch (e) {
      next(e);
    }
  },

  async complete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await ordersService.completeOrder(req.params.orderId, req.auth!.userId);
      const io = req.app.get("io") as Server | undefined;
      if (io) emitOrderStatusUpdated(io, order);
      if (order.status === OrderStatus.COMPLETED) void notifyCoordinatorOrderCompletedPush(order.id);
      res.json(ordersService.serializeDriverOrderRow(order));
    } catch (e) {
      next(e);
    }
  },

  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await ordersService.cancelByCoordinator(req.auth!.userId, req.params.orderId);
      const io = req.app.get("io") as Server | undefined;
      if (io) {
        if (order.driverId) {
          emitOrderStatusUpdated(io, order);
        } else {
          emitPendingOrderCancelled(io, order.id);
        }
      }
      res.json(order);
    } catch (e) {
      next(e);
    }
  },

  async resumeStuck(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await ordersService.resumeStuckOrderByCoordinator(req.auth!.userId, req.params.orderId);
      const io = req.app.get("io") as Server | undefined;
      if (io) emitOrderStatusUpdated(io, order);
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
  },

  async updateCompletedAmount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const body = updateCompletedOrderAmountDto.parse(req.body);
      const row = await ordersService.updateCompletedOrderAmountByCoordinator(
        req.auth!.userId,
        req.params.orderId,
        body.amount
      );
      const io = req.app.get("io") as Server | undefined;
      if (io) emitOrderStatusUpdated(io, row);
      res.json(ordersService.serializeCoordinatorOrderRow(row));
    } catch (e) {
      next(e);
    }
  }
};
