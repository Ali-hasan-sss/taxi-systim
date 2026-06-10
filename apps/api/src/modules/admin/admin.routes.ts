import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { adminController } from "./admin.controller";

export const adminRouter = Router();

adminRouter.get("/dashboard-stats", requireAuth, requireRole("ADMIN"), adminController.dashboardStats);
adminRouter.get("/orders-room", requireAuth, requireRole("ADMIN"), adminController.ordersRoom);
adminRouter.get("/orders-room/stats", requireAuth, requireRole("ADMIN"), adminController.ordersRoomStats);