import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { promotionsController } from "./promotions.controller";

export const promotionsRouter = Router();

promotionsRouter.get("/", requireAuth, requireRole("ADMIN"), promotionsController.list);
promotionsRouter.post("/", requireAuth, requireRole("ADMIN"), promotionsController.create);
promotionsRouter.patch("/:id", requireAuth, requireRole("ADMIN"), promotionsController.update);
promotionsRouter.delete("/:id", requireAuth, requireRole("ADMIN"), promotionsController.remove);
