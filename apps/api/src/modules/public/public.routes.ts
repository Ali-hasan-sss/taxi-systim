import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../../shared/auth";
import { orderMutationRateLimit } from "../../shared/rate-limit";
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
