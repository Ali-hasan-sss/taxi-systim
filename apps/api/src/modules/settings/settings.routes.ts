import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/auth";
import { prisma } from "../../shared/prisma";

export const settingsRouter = Router();

/**
 * @openapi
 * /api/settings/commission:
 *   get:
 *     tags: [Settings]
 *     summary: Get commission settings
 *   patch:
 *     tags: [Settings]
 *     summary: Update commission settings
 */
settingsRouter.get("/commission", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  const setting = await prisma.systemSettings.findFirst({ where: { key: "commission" } });
  res.json(setting);
});

settingsRouter.patch("/commission", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { commissionType, commissionValue } = req.body as { commissionType: "PERCENTAGE" | "FIXED"; commissionValue: number };
  if (commissionType !== "PERCENTAGE" && commissionType !== "FIXED") {
    res.status(400).json({ message: "نوع العمولة غير صالح" });
    return;
  }
  if (!Number.isFinite(commissionValue) || commissionValue < 0) {
    res.status(400).json({ message: "قيمة العمولة يجب أن تكون رقمًا صالحًا غير سالب" });
    return;
  }
  const setting = await prisma.systemSettings.upsert({
    where: { key: "commission" },
    update: { commissionType, commissionValue },
    create: { key: "commission", commissionType, commissionValue }
  });
  res.json(setting);
});
