import type { Request } from "express";
import rateLimit from "express-rate-limit";

type JsonRateLimiterOptions = {
  windowMs: number;
  limit: number;
  message: string;
  skipSuccessfulRequests?: boolean;
};

type MaybeAuthRequest = Request & {
  auth?: { userId?: string };
};

const authOrIpKeyGenerator = (req: Request) => {
  const authReq = req as MaybeAuthRequest;
  if (authReq.auth?.userId) {
    return `user:${authReq.auth.userId}`;
  }
  return `ip:${req.ip}`;
};

const createJsonRateLimiter = ({
  windowMs,
  limit,
  message,
  skipSuccessfulRequests = false
}: JsonRateLimiterOptions) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests,
    keyGenerator: authOrIpKeyGenerator,
    handler: (_req, res) => {
      res.status(429).json({ message });
    }
  });

export const generalApiRateLimit = createJsonRateLimiter({
  windowMs: 60_000,
  limit: Number(process.env.API_RATE_LIMIT_PER_MIN ?? 360),
  message: "عدد الطلبات كبير جدًا، حاول بعد قليل."
});

export const authLoginRateLimit = createJsonRateLimiter({
  windowMs: 10 * 60_000,
  limit: Number(process.env.AUTH_LOGIN_RATE_LIMIT_PER_10_MIN ?? 10),
  message: "محاولات تسجيل الدخول كثيرة جدًا، حاول بعد 10 دقائق.",
  skipSuccessfulRequests: true
});

export const authRefreshRateLimit = createJsonRateLimiter({
  windowMs: 10 * 60_000,
  limit: Number(process.env.AUTH_REFRESH_RATE_LIMIT_PER_10_MIN ?? 80),
  message: "طلبات تجديد الجلسة كثيرة جدًا، حاول بعد قليل.",
  skipSuccessfulRequests: true
});

export const orderMutationRateLimit = createJsonRateLimiter({
  windowMs: 60_000,
  limit: Number(process.env.ORDER_MUTATION_RATE_LIMIT_PER_MIN ?? 180),
  message: "طلبات تعديل الطلبات كثيرة جدًا، حاول بعد قليل."
});
