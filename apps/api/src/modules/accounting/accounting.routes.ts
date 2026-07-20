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
accountingRouter.get("/report", requireAuth, requireRole("ADMIN"), accountingController.report);
accountingRouter.get("/report/export.xlsx", requireAuth, requireRole("ADMIN"), accountingController.exportXlsx);
accountingRouter.post("/compensations", requireAuth, requireRole("ADMIN"), accountingController.recordDriverCompensation);
accountingRouter.get("/fines", requireAuth, requireRole("ADMIN"), accountingController.listDriverFines);
accountingRouter.post("/fines", requireAuth, requireRole("ADMIN"), accountingController.recordDriverFine);
accountingRouter.post("/fines/settle", requireAuth, requireRole("ADMIN"), accountingController.settleDriverFine);
accountingRouter.post("/payments", requireAuth, requireRole("ADMIN"), accountingController.recordPayment);
accountingRouter.post("/payments/settle-order", requireAuth, requireRole("ADMIN"), accountingController.settleOrderCommission);
accountingRouter.post("/payments/settle-filtered", requireAuth, requireRole("ADMIN"), accountingController.settleFilteredCommissions);
