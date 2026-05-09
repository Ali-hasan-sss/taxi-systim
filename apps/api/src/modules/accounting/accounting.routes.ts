import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { accountingController } from "./accounting.controller";

export const accountingRouter = Router();

/**
 * @openapi
 * /api/accounting/payments:
 *   post:
 *     tags: [Accounting]
 *     summary: Record commission payment (full or partial)
 *     responses:
 *       201:
 *         description: Created
 */
accountingRouter.post("/payments", requireAuth, requireRole("ADMIN"), accountingController.recordPayment);
