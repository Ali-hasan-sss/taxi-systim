import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { Role as RoleEnum } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { normalizePhoneDigits } from "../../shared/phone";

const parseExpiresIn = (value: string | undefined, fallback: SignOptions["expiresIn"]): SignOptions["expiresIn"] => {
  if (!value) return fallback;
  return /^\d+$/.test(value) ? Number(value) : (value as SignOptions["expiresIn"]);
};

const signAccess = (userId: string, role: string) =>
  jwt.sign({ sub: userId, role }, process.env.JWT_ACCESS_SECRET ?? "change-me", {
    expiresIn: parseExpiresIn(process.env.JWT_ACCESS_EXPIRES, "15m")
  });

const signRefresh = (userId: string, role: string) =>
  jwt.sign({ sub: userId, role }, process.env.JWT_REFRESH_SECRET ?? "change-me", {
    expiresIn: parseExpiresIn(
      process.env.JWT_REFRESH_EXPIRES_DAYS ? `${process.env.JWT_REFRESH_EXPIRES_DAYS}d` : undefined,
      "30d"
    )
  });

async function issueTokens(userId: string, role: Role) {
  const accessToken = signAccess(userId, role);
  const refreshToken = signRefresh(userId, role);
  const tokenHash = await bcrypt.hash(refreshToken, 10);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });
  return { accessToken, refreshToken };
}

type PublicUser = {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  role: Role;
};

function toPublicUser(u: {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  role: Role;
}): PublicUser {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    fullName: u.fullName,
    role: u.role
  };
}

export const authService = {
  async loginByEmail(email: string, password: string) {
    const user = await prisma.user.findFirst({
      where: { email: email.trim().toLowerCase() }
    });
    if (!user) throw new AppError("Invalid credentials", 401);
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError("Invalid credentials", 401);
    if (!user.isActive) throw new AppError("User is inactive", 403);

    const tokens = await issueTokens(user.id, user.role);
    return { ...tokens, user: toPublicUser(user) };
  },

  async loginByPhone(phoneRaw: string, password: string) {
    const phone = normalizePhoneDigits(phoneRaw);
    if (!phone) throw new AppError("Invalid credentials", 401);
    const user = await prisma.user.findFirst({ where: { phone } });
    if (!user) throw new AppError("Invalid credentials", 401);
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError("Invalid credentials", 401);
    if (!user.isActive) throw new AppError("User is inactive", 403);

    const tokens = await issueTokens(user.id, user.role);
    return { ...tokens, user: toPublicUser(user) };
  },

  async adminLogin(identifier: { email?: string; phone?: string }, password: string) {
    const result = identifier.email
      ? await this.loginByEmail(identifier.email, password)
      : await this.loginByPhone(identifier.phone ?? "", password);
    if (result.user.role !== RoleEnum.ADMIN) {
      throw new AppError("Admin access only", 403);
    }
    return result;
  },

  async coordinatorLogin(phoneRaw: string, password: string) {
    const result = await this.loginByPhone(phoneRaw, password);
    if (result.user.role !== RoleEnum.COORDINATOR) {
      throw new AppError("Coordinator access only", 403);
    }
    return result;
  },

  /** تسجيل دخول السائق عبر POST /auth/login */
  async login(phoneRaw: string, password: string) {
    return this.loginByPhone(phoneRaw, password);
  },

  async refresh(refreshToken: string) {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET ?? "change-me") as {
      sub: string;
      role: Role;
    };
    const tokens = await prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } }
    });

    let matched = false;
    for (const token of tokens) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await bcrypt.compare(refreshToken, token.tokenHash);
      if (ok) {
        matched = true;
        break;
      }
    }
    if (!matched) throw new AppError("Invalid refresh token", 401);

    const accessToken = signAccess(payload.sub, payload.role);
    return { accessToken };
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, fullName: true, role: true, isActive: true }
    });
    if (!user) throw new AppError("User not found", 404);
    return user;
  },

  async coordinatorMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, fullName: true, role: true, isActive: true }
    });
    if (!user) throw new AppError("User not found", 404);
    const coordinator = await prisma.coordinator.findUnique({
      where: { userId },
      select: { id: true }
    });
    return { ...user, coordinatorId: coordinator?.id ?? null };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true }
    });
    if (!user) throw new AppError("User not found", 404);

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new AppError("كلمة المرور الحالية غير صحيحة", 400);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash }
      }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);
  },

  async setExpoPushToken(userId: string, token: string) {
    const t = token.trim();
    if (!t) throw new AppError("رمز الإشعار غير صالح", 400);
    await prisma.user.update({ where: { id: userId }, data: { expoPushToken: t } });
  },

  async clearExpoPushToken(userId: string) {
    await prisma.user.update({ where: { id: userId }, data: { expoPushToken: null } });
  }
};
