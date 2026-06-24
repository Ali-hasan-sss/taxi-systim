import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { adminController } from "./admin.controller";

export const adminRouter = Router();

adminRouter.get("/dashboard-stats", requireAuth, requireRole("ADMIN"), adminController.dashboardStats);
adminRouter.get("/orders-room", requireAuth, requireRole("ADMIN"), adminController.ordersRoom);
adminRouter.get("/orders-room/stats", requireAuth, requireRole("ADMIN"), adminController.ordersRoomStats);
adminRouter.get("/orders", requireAuth, requireRole("ADMIN"), adminController.ordersTable);
adminRouter.get("/orders/stats", requireAuth, requireRole("ADMIN"), adminController.ordersTableStats);
adminRouter.patch("/orders/:orderId/amount", requireAuth, requireRole("ADMIN"), adminController.updateOrderAmount);
adminRouter.patch("/orders/:orderId/details", requireAuth, requireRole("ADMIN"), adminController.updateOrderDetails);
adminRouter.delete("/orders/:orderId", requireAuth, requireRole("ADMIN"), adminController.deleteOrder);