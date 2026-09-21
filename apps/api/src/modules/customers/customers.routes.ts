import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { asyncRoute } from "../../shared/async-route";
import { customersController } from "./customers.controller";

export const customersRouter = Router();

customersRouter.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "COORDINATOR"),
  asyncRoute(customersController.list)
);

customersRouter.patch(
  "/:customerId/contacted",
  requireAuth,
  requireRole("ADMIN", "COORDINATOR"),
  asyncRoute(customersController.markContacted)
);
