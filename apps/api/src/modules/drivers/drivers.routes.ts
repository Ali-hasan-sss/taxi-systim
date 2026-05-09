import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { driversController } from "./drivers.controller";

export const driversRouter = Router();

driversRouter.get("/me", requireAuth, requireRole("DRIVER"), driversController.me);
driversRouter.get("/for-assignment", requireAuth, requireRole("COORDINATOR"), driversController.forAssignment);
driversRouter.get("/live", requireAuth, requireRole("COORDINATOR"), driversController.live);
