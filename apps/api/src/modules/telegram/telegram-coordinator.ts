import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "../../shared/prisma";

export const TELEGRAM_COORDINATOR_EMAIL = "telegram-bot@taxi.internal";
export const TELEGRAM_COORDINATOR_NAME = "بوت تيليغرام";

export function excludeTelegramCoordinatorUser() {
  return {
    OR: [{ email: null }, { email: { not: TELEGRAM_COORDINATOR_EMAIL } }]
  };
}

/** حساب منسق خاص بطلبات البوت، ولا يُستخدم لتسجيل الدخول. */
export async function ensureTelegramCoordinatorUserId(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: TELEGRAM_COORDINATOR_EMAIL },
    select: { id: true, fullName: true, isActive: true, deletedAt: true }
  });
  if (existing) {
    if (existing.fullName !== TELEGRAM_COORDINATOR_NAME || !existing.isActive || existing.deletedAt) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { fullName: TELEGRAM_COORDINATOR_NAME, isActive: true, deletedAt: null }
      });
    }
    await prisma.coordinator.upsert({
      where: { userId: existing.id },
      update: {},
      create: { userId: existing.id }
    });
    return existing.id;
  }

  const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
  const user = await prisma.user.create({
    data: {
      email: TELEGRAM_COORDINATOR_EMAIL,
      passwordHash,
      fullName: TELEGRAM_COORDINATOR_NAME,
      role: Role.COORDINATOR,
      isActive: true
    },
    select: { id: true }
  });
  await prisma.coordinator.create({ data: { userId: user.id } });
  return user.id;
}
