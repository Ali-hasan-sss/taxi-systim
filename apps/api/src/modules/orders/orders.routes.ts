import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { ordersController } from "./orders.controller";
import { orderMutationRateLimit } from "../../shared/rate-limit";

export const ordersRouter = Router();

ordersRouter.get("/driver/stats", requireAuth, requireRole("DRIVER"), ordersController.driverOrderStats);
ordersRouter.get("/driver/room", requireAuth, requireRole("DRIVER"), ordersController.driverOrderRoom);
ordersRouter.get("/driver/reports", requireAuth, requireRole("DRIVER"), ordersController.driverReport);
ordersRouter.get("/driver/orders", requireAuth, requireRole("DRIVER"), ordersController.listDriverOrders);
ordersRouter.get(
  "/coordinator/stats",
  requireAuth,
  requireRole("COORDINATOR"),
  ordersController.coordinatorOrderStats
);
ordersRouter.get("/reports", requireAuth, requireRole("COORDINATOR"), ordersController.report);
ordersRouter.get("/", requireAuth, requireRole("COORDINATOR"), ordersController.listMine);

/**
 * @openapi
 * /api/orders:
 *   post:
 *     tags: [Orders]
 *     summary: Create new taxi order
 *     responses:
 *       201:
 *         description: Created
 */
ordersRouter.post("/", requireAuth, requireRole("COORDINATOR", "ADMIN"), orderMutationRateLimit, ordersController.create);
ordersRouter.patch("/:orderId/cancel", requireAuth, requireRole("COORDINATOR", "ADMIN"), orderMutationRateLimit, ordersController.cancel);
ordersRouter.patch(
  "/:orderId/resume-stuck",
  requireAuth,
  requireRole("COORDINATOR", "ADMIN"),
  orderMutationRateLimit,
  ordersController.resumeStuck
);
ordersRouter.patch("/:orderId/assign", requireAuth, requireRole("COORDINATOR", "ADMIN"), orderMutationRateLimit, ordersController.assign);
ordersRouter.patch(
  "/:orderId/amount",
  requireAuth,
  requireRole("COORDINATOR", "ADMIN"),
  orderMutationRateLimit,
  ordersController.updateCompletedAmount
);
ordersRouter.patch(
  "/:orderId/mark-customer-info-sent",
  requireAuth,
  requireRole("COORDINATOR", "ADMIN"),
  orderMutationRateLimit,
  ordersController.markCustomerInfoSent
);
ordersRouter.patch(
  "/:orderId/mark-invoice-sent",
  requireAuth,
  requireRole("COORDINATOR", "ADMIN"),
  orderMutationRateLimit,
  ordersController.markInvoiceSent
);
ordersRouter.patch("/:orderId/accept", requireAuth, requireRole("DRIVER"), orderMutationRateLimit, ordersController.acceptByDriver);
ordersRouter.patch("/:orderId/board", requireAuth, requireRole("DRIVER"), orderMutationRateLimit, ordersController.boardCustomer);
ordersRouter.patch(
  "/:orderId/no-show",
  requireAuth,
  requireRole("DRIVER"),
  orderMutationRateLimit,
  ordersController.reportCustomerNoShow
);
ordersRouter.patch("/:orderId/complete", requireAuth, requireRole("DRIVER"), orderMutationRateLimit, ordersController.complete);
