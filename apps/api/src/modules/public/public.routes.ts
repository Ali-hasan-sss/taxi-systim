import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../../shared/auth";
import { getPublicAppConfig } from "../../shared/app-version";
import { orderMutationRateLimit } from "../../shared/rate-limit";
import { getBranding, resolveBrandingFile } from "../settings/branding.service";
import { publicController } from "./public.controller";

export const publicRouter = Router();

const publicTaxiRequestRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: Number(process.env.PUBLIC_TAXI_REQUEST_RATE_LIMIT_PER_10_MIN ?? 8),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${req.ip}`,
  handler: (_req, res) => {
    res.status(429).json({ message: "طلبات كثيرة من نفس الشبكة. حاول بعد قليل." });
  }
});

function apiBaseFromRequest(req: Request) {
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost:4000";
  return `${proto}://${host}/api`;
}

publicRouter.get("/branding", async (req, res, next) => {
  try {
    res.json(await getBranding(apiBaseFromRequest(req)));
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/branding/files/:filename", async (req, res: Response, next) => {
  try {
    const filePath = await resolveBrandingFile(req.params.filename ?? "");
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    res.type(mime);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: "الصورة غير موجودة" });
      return;
    }
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/app-config", async (_req, res) => {
  try {
    const config = await getPublicAppConfig();
    res.json(config);
  } catch {
    res.json({
      driver: { minVersion: "0.0.0", androidUrl: "", iosUrl: "" },
      coordinator: { minVersion: "0.0.0", androidUrl: "", iosUrl: "" }
    });
  }
});

publicRouter.post("/taxi-request", publicTaxiRequestRateLimit, publicController.createTaxiRequest);

publicRouter.get(
  "/web-inquiries",
  requireAuth,
  requireRole("COORDINATOR", "ADMIN"),
  publicController.listWebInquiries
);

publicRouter.patch(
  "/web-inquiries/:orderId/publish",
  requireAuth,
  requireRole("COORDINATOR", "ADMIN"),
  orderMutationRateLimit,
  publicController.publishWebInquiry
);

publicRouter.patch(
  "/web-inquiries/:orderId/dismiss",
  requireAuth,
  requireRole("COORDINATOR", "ADMIN"),
  orderMutationRateLimit,
  publicController.dismissWebInquiry
);
