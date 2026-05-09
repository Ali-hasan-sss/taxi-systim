import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "./app-error";

export const errorMiddleware = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    const first = err.errors[0];
    const message = first?.message ?? "بيانات غير صالحة";
    return res.status(400).json({ message });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  // eslint-disable-next-line no-console
  console.error("[api] unhandled error:", err);
  return res.status(500).json({ message: "Internal server error" });
};
