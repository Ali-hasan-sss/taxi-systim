import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
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
usersRouter.get("/", usersController.list);
usersRouter.post("/bulk-drivers", usersController.bulkCreateDrivers);
usersRouter.post("/", usersController.create);
usersRouter.patch("/:userId", usersController.update);
usersRouter.patch("/:userId/status", usersController.setStatus);
usersRouter.delete("/:userId", usersController.remove);
