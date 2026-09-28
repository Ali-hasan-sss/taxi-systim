import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../../shared/auth";
import type { AuthRequest } from "../../shared/auth";
import { getAppVersionSettings, updateAppVersionSettings } from "../../shared/app-version";
import { AppError } from "../../shared/app-error";
import { prisma } from "../../shared/prisma";
import { syncAllDriversWorkBlockState, syncDriversUsingGlobalDebtLimit } from "../../shared/driver-debt-block";
import { accountingService } from "../accounting/accounting.service";
import { brandingImageUpload } from "./branding-upload";
import { getBranding, replaceBrandingFile, updateAppName, type BrandingSlot } from "./branding.service";

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

settingsRouter.patch("/commission", requireAuth, requireRole("ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const { commissionType, commissionValue, commissionDebtLimit, paymentMode, confirmZeroBalances } = req.body as {
      commissionType: "PERCENTAGE" | "FIXED";
      commissionValue: number;
      commissionDebtLimit?: number;
      paymentMode?: "POSTPAID" | "PREPAID";
      confirmZeroBalances?: boolean;
    };
    if (commissionType !== "PERCENTAGE" && commissionType !== "FIXED") {
      res.status(400).json({ message: "نوع العمولة غير صالح" });
      return;
    }
    if (!Number.isFinite(commissionValue) || commissionValue < 0) {
      res.status(400).json({ message: "قيمة العمولة يجب أن تكون رقمًا صالحًا غير سالب" });
      return;
    }
    if (paymentMode != null && paymentMode !== "POSTPAID" && paymentMode !== "PREPAID") {
      res.status(400).json({ message: "وضع الدفع غير صالح" });
      return;
    }
    const current = await prisma.systemSettings.findUnique({ where: { key: "commission" } });
    const nextLimit =
      commissionDebtLimit === undefined ? Number(current?.commissionDebtLimit ?? 2000) : Number(commissionDebtLimit);
    if (!Number.isFinite(nextLimit) || nextLimit < 0 || nextLimit > 99_999_999.99) {
      res.status(400).json({ message: "الحد الأعلى للمبلغ المترتب يجب أن يكون رقمًا صالحًا غير سالب" });
      return;
    }
    const previousMode = current?.paymentMode === "PREPAID" ? "PREPAID" : "POSTPAID";
    const nextMode = paymentMode ?? previousMode;
    const modeChanged = nextMode !== previousMode;

    if (modeChanged) {
      const preview = await accountingService.previewPaymentModeSwitch();
      if (preview.needsZeroing && !confirmZeroBalances) {
        res.status(409).json({
          code: "BALANCES_REQUIRE_ZEROING",
          message: preview.message,
          preview
        });
        return;
      }
      await accountingService.archiveAndZeroDriverBalancesForModeSwitch({
        fromMode: previousMode,
        toMode: nextMode,
        adminUserId: req.auth!.userId
      });
    }

    const setting = await prisma.systemSettings.upsert({
      where: { key: "commission" },
      update: { commissionType, commissionValue, commissionDebtLimit: nextLimit, paymentMode: nextMode },
      create: {
        key: "commission",
        commissionType,
        commissionValue,
        commissionDebtLimit: nextLimit,
        paymentMode: nextMode
      }
    });
    const previousLimit = current ? Number(current.commissionDebtLimit) : null;
    if (modeChanged) {
      void syncAllDriversWorkBlockState();
    } else if (previousLimit !== nextLimit) {
      void syncDriversUsingGlobalDebtLimit();
    }
    res.json(setting);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/settings/app-versions:
 *   get:
 *     tags: [Settings]
 *     summary: Get required mobile app versions
 *   patch:
 *     tags: [Settings]
 *     summary: Update required mobile app versions
 */
settingsRouter.get("/app-versions", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  const setting = await getAppVersionSettings();
  res.json(setting);
});

settingsRouter.patch("/app-versions", requireAuth, requireRole("ADMIN"), async (req: AuthRequest, res) => {
  try {
    const setting = await updateAppVersionSettings(req.body ?? {}, req.auth?.userId);
    res.json(setting);
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل تحديث إعدادات النسخ";
    res.status(400).json({ message });
  }
});

function apiBaseFromRequest(req: AuthRequest) {
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost:4000";
  return `${proto}://${host}/api`;
}

function uploadBrandingImage(req: AuthRequest, res: Response, next: NextFunction) {
  brandingImageUpload.single("image")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const message =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "حجم الصورة أكبر من المسموح (6 ميغابايت)"
        : err instanceof Error
          ? err.message
          : "تعذر رفع الصورة";
    res.status(400).json({ message });
  });
}

async function handleBrandingUpload(slot: BrandingSlot, req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.file?.filename) {
      throw new AppError("لم يُرفَع ملف صورة", 400);
    }
    const branding = await replaceBrandingFile(
      slot,
      req.file.filename,
      req.file.size,
      req.auth?.userId,
      apiBaseFromRequest(req)
    );
    res.json(branding);
  } catch (err) {
    if (req.file?.filename) {
      try {
        fs.unlinkSync(path.join(req.file.destination, req.file.filename));
      } catch {
        /* ignore */
      }
    }
    next(err);
  }
}

/**
 * @openapi
 * /api/settings/branding:
 *   get:
 *     tags: [Settings]
 *     summary: Get platform logo and app backgrounds
 */
settingsRouter.get("/branding", requireAuth, requireRole("ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    res.json(await getBranding(apiBaseFromRequest(req)));
  } catch (err) {
    next(err);
  }
});

settingsRouter.patch("/branding", requireAuth, requireRole("ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const appName = typeof req.body?.appName === "string" ? req.body.appName : "";
    res.json(await updateAppName(appName, req.auth?.userId, apiBaseFromRequest(req)));
  } catch (err) {
    next(err);
  }
});

settingsRouter.post("/branding/logo", requireAuth, requireRole("ADMIN"), uploadBrandingImage, (req: AuthRequest, res, next) => {
  void handleBrandingUpload("logo", req, res, next);
});

settingsRouter.post(
  "/branding/coordinator-background",
  requireAuth,
  requireRole("ADMIN"),
  uploadBrandingImage,
  (req: AuthRequest, res, next) => {
    void handleBrandingUpload("coordinator-background", req, res, next);
  }
);

settingsRouter.post(
  "/branding/driver-background",
  requireAuth,
  requireRole("ADMIN"),
  uploadBrandingImage,
  (req: AuthRequest, res, next) => {
    void handleBrandingUpload("driver-background", req, res, next);
  }
);
