import { Router } from "express";
import { authController } from "./auth.controller";
import { requireAuth, requireRole } from "../../shared/auth";
import { authLoginRateLimit, authRefreshRateLimit } from "../../shared/rate-limit";

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
authRouter.post("/login", authLoginRateLimit, authController.login);
authRouter.post("/admin/login", authLoginRateLimit, authController.adminLogin);
authRouter.post("/coordinator/login", authLoginRateLimit, authController.coordinatorLogin);
authRouter.post("/refresh", authRefreshRateLimit, authController.refresh);
authRouter.get("/me", requireAuth, authController.me);
authRouter.get("/admin/me", requireAuth, requireRole("ADMIN"), authController.me);
authRouter.get("/coordinator/me", requireAuth, requireRole("COORDINATOR"), authController.coordinatorMe);
authRouter.post("/change-password", requireAuth, requireRole("ADMIN"), authController.changePassword);
authRouter.post("/push-token", requireAuth, authController.registerPushToken);
authRouter.delete("/push-token", requireAuth, authController.clearPushToken);
