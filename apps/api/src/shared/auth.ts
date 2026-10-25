import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { AppError } from "./app-error";
import { prisma } from "./prisma";

export const COORDINATOR_DISABLED_MESSAGE = "تم تعطيل حسابك. تواصل مع الإدارة.";

export interface AuthRequest extends Request {
  auth?: { userId: string; role: Role };
}

async function assertCoordinatorAccountActive(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, deletedAt: true }
  });
  if (!user || user.deletedAt || user.role !== Role.COORDINATOR || !user.isActive) {
    throw new AppError(COORDINATOR_DISABLED_MESSAGE, 403);
  }
}

export const requireAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    next(new AppError("Unauthorized", 401));
    return;
  }
  let payload: { sub: string; role: Role };
  try {
    payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET ?? "change-me") as {
      sub: string;
      role: Role;
    };
  } catch {
    next(new AppError("Unauthorized", 401));
    return;
  }
  req.auth = { userId: payload.sub, role: payload.role };
  if (payload.role !== Role.COORDINATOR) {
    next();
    return;
  }
  void assertCoordinatorAccountActive(payload.sub).then(() => next()).catch(next);
};

export const requireRole =
  (...roles: Role[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      throw new AppError("Forbidden", 403);
    }
    next();
  };
