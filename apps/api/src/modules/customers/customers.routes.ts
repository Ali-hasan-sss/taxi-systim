import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { customersController } from "./customers.controller";

export const customersRouter = Router();

customersRouter.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "COORDINATOR"),
  customersController.list
);
