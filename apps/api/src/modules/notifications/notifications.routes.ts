import { Router } from "express";
import { requireAuth } from "../../shared/auth";
import { notificationsController } from "./notifications.controller";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireAuth, notificationsController.listMine);
notificationsRouter.post("/read", requireAuth, notificationsController.markRead);
