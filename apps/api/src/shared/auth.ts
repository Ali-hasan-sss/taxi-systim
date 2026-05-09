import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { AppError } from "./app-error";

export interface AuthRequest extends Request {
  auth?: { userId: string; role: Role };
}

export const requireAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    throw new AppError("Unauthorized", 401);
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET ?? "change-me") as {
      sub: string;
      role: Role;
    };
    req.auth = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    throw new AppError("Unauthorized", 401);
  }
};

export const requireRole =
  (...roles: Role[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      throw new AppError("Forbidden", 403);
    }
    next();
  };
