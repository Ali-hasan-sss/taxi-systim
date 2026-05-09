import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { ordersController } from "./orders.controller";

export const ordersRouter = Router();

ordersRouter.get("/driver/stats", requireAuth, requireRole("DRIVER"), ordersController.driverOrderStats);
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
ordersRouter.patch("/:orderId/assign", requireAuth, requireRole("COORDINATOR"), ordersController.assign);
ordersRouter.patch("/:orderId/complete", requireAuth, requireRole("DRIVER"), ordersController.complete);
