import { Router } from "express";
import { authController } from "./auth.controller";
import { requireAuth, requireRole } from "../../shared/auth";

export const authRouter = Router();

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             email: admin@taxi.local
 *             password: secret123
 *     responses:
 *       200:
 *         description: Logged in successfully
 */
authRouter.post("/login", authController.login);
authRouter.post("/admin/login", authController.adminLogin);
authRouter.post("/coordinator/login", authController.coordinatorLogin);
authRouter.post("/refresh", authController.refresh);
authRouter.get("/me", requireAuth, authController.me);
authRouter.get("/admin/me", requireAuth, requireRole("ADMIN"), authController.me);
authRouter.get("/coordinator/me", requireAuth, requireRole("COORDINATOR"), authController.coordinatorMe);
