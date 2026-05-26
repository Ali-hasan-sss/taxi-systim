import bcrypt from "bcryptjs";
import { Role, VehicleKind } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { normalizePhoneDigits } from "../../shared/phone";

export type DriverProfilePayload = {
  vehicleBrand?: string | null;
  vehicleKind?: VehicleKind | null;
  vehicleColor?: string | null;
  plateNumber?: string | null;
};

export const usersService = {
  async list(filters: { role?: Role; isActive?: boolean }) {
    return prisma.user.findMany({
      where: {
        role: filters.role,
        isActive: filters.isActive
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        driver: {
          select: {
            id: true,
            vehicleBrand: true,
            vehicleKind: true,
            vehicleColor: true,
            vehicleNumber: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  },

  async create(payload: {
    email?: string;
    password: string;
    fullName: string;
    phone?: string;
    role: Role;
    driverProfile?: DriverProfilePayload;
  }) {
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const email =
      payload.role === Role.ADMIN
        ? payload.email!.trim().toLowerCase()
        : payload.email?.trim()
          ? payload.email.trim().toLowerCase()
          : null;
    const phone =
      payload.role === Role.ADMIN
        ? payload.phone
          ? normalizePhoneDigits(payload.phone)
          : null
        : normalizePhoneDigits(payload.phone!);

    if (phone) {
      const taken = await prisma.user.findFirst({ where: { phone } });
      if (taken) throw new AppError("رقم الهاتف مستخدم مسبقًا", 409);
    }
    if (email) {
      const taken = await prisma.user.findFirst({ where: { email } });
      if (taken) throw new AppError("البريد مستخدم مسبقًا", 409);
    }

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: payload.fullName.trim(),
          phone,
          role: payload.role
        },
        select: { id: true, email: true, fullName: true, phone: true, role: true, isActive: true, createdAt: true }
      });
      if (payload.role === Role.DRIVER) {
        await tx.driver.create({ data: { userId: user.id } });
        if (payload.driverProfile) {
          const dp = payload.driverProfile;
          await tx.driver.update({
            where: { userId: user.id },
            data: {
              vehicleBrand: dp.vehicleBrand?.trim() || null,
              vehicleKind: dp.vehicleKind ?? null,
              vehicleColor: dp.vehicleColor?.trim() || null,
              vehicleNumber: dp.plateNumber?.trim() || null
            }
          });
        }
      }
      return user;
    });
  },

  async update(
    userId: string,
    payload: {
      email?: string;
      password?: string;
      fullName?: string;
      phone?: string | null;
      role?: Role;
      driverProfile?: DriverProfilePayload;
    }
  ) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new AppError("المستخدم غير موجود", 404);

    const nextRole = payload.role ?? existing.role;
    const passwordHash = payload.password ? await bcrypt.hash(payload.password, 10) : undefined;

    let email: string | null | undefined = payload.email !== undefined ? payload.email.trim().toLowerCase() || null : undefined;
    if (email === "") email = null;

    let phone: string | null | undefined;
    if (payload.phone !== undefined) {
      phone = payload.phone ? normalizePhoneDigits(payload.phone) : null;
    }

    if (nextRole === Role.COORDINATOR || nextRole === Role.DRIVER) {
      const effectivePhone = phone !== undefined ? phone : existing.phone;
      if (!effectivePhone) {
        throw new AppError("رقم الهاتف إلزامي للمنسق والسائق", 400);
      }
    }

    if (phone !== undefined && phone) {
      const taken = await prisma.user.findFirst({ where: { phone, NOT: { id: userId } } });
      if (taken) throw new AppError("رقم الهاتف مستخدم مسبقًا", 409);
    }

    if (email !== undefined && email) {
      const taken = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } });
      if (taken) throw new AppError("البريد مستخدم مسبقًا", 409);
    }

    if (nextRole === Role.ADMIN && email === null) {
      throw new AppError("لا يمكن إزالة البريد عن حساب الأدمن", 400);
    }

    const data: {
      email?: string | null;
      passwordHash?: string;
      fullName?: string;
      phone?: string | null;
      role?: Role;
    } = {};
    if (email !== undefined) data.email = email;
    if (passwordHash !== undefined) data.passwordHash = passwordHash;
    if (payload.fullName !== undefined) data.fullName = payload.fullName.trim();
    if (phone !== undefined) data.phone = phone;
    if (payload.role !== undefined) data.role = payload.role;

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, fullName: true, phone: true, role: true, isActive: true, createdAt: true }
    });
    if (updated.role === Role.DRIVER) {
      await prisma.driver.upsert({
        where: { userId: updated.id },
        create: { userId: updated.id },
        update: {}
      });
      if (payload.driverProfile) {
        const dp = payload.driverProfile;
        const data: {
          vehicleBrand?: string | null;
          vehicleKind?: VehicleKind | null;
          vehicleColor?: string | null;
          vehicleNumber?: string | null;
        } = {};
        if (dp.vehicleBrand !== undefined) data.vehicleBrand = dp.vehicleBrand?.trim() || null;
        if (dp.vehicleKind !== undefined) data.vehicleKind = dp.vehicleKind;
        if (dp.vehicleColor !== undefined) data.vehicleColor = dp.vehicleColor?.trim() || null;
        if (dp.plateNumber !== undefined) data.vehicleNumber = dp.plateNumber?.trim() || null;
        if (Object.keys(data).length > 0) {
          await prisma.driver.update({
            where: { userId: updated.id },
            data
          });
        }
      }
    }
    return updated;
  },

  async remove(userId: string) {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        coordinator: { select: { id: true } },
        driver: { select: { id: true } }
      }
    });
    if (!existing) throw new AppError("المستخدم غير موجود", 404);

    if (existing.role === Role.COORDINATOR && existing.coordinator) {
      const orderCount = await prisma.order.count({
        where: { coordinatorId: existing.coordinator.id }
      });
      if (orderCount > 0) {
        throw new AppError(
          "لا يمكن حذف المنسق لوجود طلبات مرتبطة به. عطّل الحساب بدل الحذف أو احذف الطلبات يدويًا من قاعدة البيانات إن كان مسموحًا.",
          409
        );
      }
    }

    if (existing.role === Role.DRIVER && existing.driver) {
      const driverId = existing.driver.id;
      const [commissionRows, paymentRows, txRows] = await Promise.all([
        prisma.commission.count({ where: { driverId } }),
        prisma.commissionPayment.count({ where: { driverId } }),
        prisma.financialTransaction.count({ where: { driverId } })
      ]);
      if (commissionRows + paymentRows + txRows > 0) {
        throw new AppError(
          "لا يمكن حذف السائق لوجود عمولات أو معاملات مرتبطة به. عطّل الحساب بدل الحذف.",
          409
        );
      }
    }

    await prisma.user.delete({ where: { id: userId } });
    return { message: "User deleted successfully" };
  },

  async setStatus(userId: string, isActive: boolean) {
    return prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, fullName: true, phone: true, role: true, isActive: true, createdAt: true }
    });
  }
};
