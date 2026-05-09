import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { ordersController } from "./orders.controller";

export const ordersRouter = Router();

ordersRouter.get("/driver/stats", requireAuth, requireRole("DRIVER"), ordersController.driverOrderStats);
ordersRouter.get("/driver/room", requireAuth, requireRole("DRIVER"), ordersController.driverOrderRoom);
ordersRouter.get("/driver/orders", requireAuth, requireRole("DRIVER"), ordersController.listDriverOrders);
ordersRouter.get(
  "/coordinator/stats",
  requireAuth,
  requireRole("COORDINATOR"),
  ordersController.coordinatorOrderStats
);
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
ordersRouter.post("/", requireAuth, requireRole("COORDINATOR"), ordersController.create);
ordersRouter.patch("/:orderId/cancel", requireAuth, requireRole("COORDINATOR"), ordersController.cancel);
ordersRouter.patch("/:orderId/resume-stuck", requireAuth, requireRole("COORDINATOR"), ordersController.resumeStuck);
ordersRouter.patch("/:orderId/assign", requireAuth, requireRole("COORDINATOR"), ordersController.assign);
ordersRouter.patch(
  "/:orderId/amount",
  requireAuth,
  requireRole("COORDINATOR"),
  ordersController.updateCompletedAmount
);
ordersRouter.patch("/:orderId/accept", requireAuth, requireRole("DRIVER"), ordersController.acceptByDriver);
ordersRouter.patch("/:orderId/board", requireAuth, requireRole("DRIVER"), ordersController.boardCustomer);
ordersRouter.patch("/:orderId/no-show", requireAuth, requireRole("DRIVER"), ordersController.reportCustomerNoShow);
ordersRouter.patch("/:orderId/complete", requireAuth, requireRole("DRIVER"), ordersController.complete);
