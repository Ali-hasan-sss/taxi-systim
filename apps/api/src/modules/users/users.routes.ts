import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { asyncRoute } from "../../shared/async-route";
import { usersController } from "./users.controller";

export const usersRouter = Router();

/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: List users with optional role/status filters
 *   post:
 *     tags: [Users]
 *     summary: Create user
 */
usersRouter.use(requireAuth, requireRole("ADMIN"));
usersRouter.get("/export.xlsx", asyncRoute(usersController.exportXlsx));
usersRouter.get("/", asyncRoute(usersController.list));
usersRouter.get("/:userId/profile", asyncRoute(usersController.getProfile));
usersRouter.get("/:userId/coordinators", asyncRoute(usersController.listDriverCoordinators));
usersRouter.post("/bulk-drivers", asyncRoute(usersController.bulkCreateDrivers));
usersRouter.post("/", asyncRoute(usersController.create));
usersRouter.patch("/:userId", asyncRoute(usersController.update));
usersRouter.patch("/:userId/status", asyncRoute(usersController.setStatus));
usersRouter.delete("/:userId", asyncRoute(usersController.remove));
