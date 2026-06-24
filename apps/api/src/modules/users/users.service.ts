import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { OrderStatus, Role, VehicleKind } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { normalizePhoneDigits } from "../../shared/phone";

export type DriverProfilePayload = {
  vehicleBrand?: string | null;
  vehicleKind?: VehicleKind | null;
  vehicleColor?: string | null;
  plateNumber?: string | null;
};

const IN_PROGRESS_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.ACCEPTED,
  OrderStatus.ARRIVED,
  OrderStatus.EN_ROUTE_TO_CUSTOMER,
  OrderStatus.STARTED,
  OrderStatus.STUCK
];

const VEHICLE_KIND_LABELS: Record<VehicleKind, string> = {
  PUBLIC: "عامة",
  PRIVATE: "خاصة",
  VIP: "VIP"
};

function syriaTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Damascus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function formatVehicleDetails(
  driver: null | {
    vehicleBrand: string | null;
    vehicleKind: VehicleKind | null;
    vehicleColor: string | null;
    vehicleNumber: string | null;
  }
): string {
  if (!driver) return "";
  const parts: string[] = [];
  if (driver.vehicleBrand?.trim()) parts.push(driver.vehicleBrand.trim());
  if (driver.vehicleKind) parts.push(VEHICLE_KIND_LABELS[driver.vehicleKind]);
  if (driver.vehicleColor?.trim()) parts.push(driver.vehicleColor.trim());
  if (driver.vehicleNumber?.trim()) parts.push(`لوحة: ${driver.vehicleNumber.trim()}`);
  return parts.join(" · ");
}

export const usersService = {
  async list(filters: { role?: Role; isActive?: boolean; q?: string }) {
    const q = filters.q?.trim();
    const searchWhere = q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
            { driver: { vehicleBrand: { contains: q, mode: "insensitive" as const } } },
            { driver: { vehicleColor: { contains: q, mode: "insensitive" as const } } },
            { driver: { vehicleNumber: { contains: q, mode: "insensitive" as const } } }
          ]
        }
      : undefined;

    return prisma.user.findMany({
      where: {
        role: filters.role,
        isActive: filters.isActive,
        ...(searchWhere ?? {})
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        expoPushToken: true,
        driver: {
          select: {
            id: true,
            vehicleBrand: true,
            vehicleKind: true,
            vehicleColor: true,
            vehicleNumber: true
          }
        },
        coordinator: {
          select: { id: true }
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

  async bulkCreateDrivers(
    rows: {
      fullName: string;
      phone: string;
      password: string;
      vehicleBrand?: string | null;
      vehicleKind?: VehicleKind | null;
      vehicleColor?: string | null;
      plateNumber?: string | null;
    }[]
  ) {
    const created: { id: string; fullName: string; phone: string | null }[] = [];
    const failed: { row: number; fullName: string; reason: string }[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]!;
      try {
        const user = await this.create({
          fullName: row.fullName,
          phone: row.phone,
          password: row.password,
          role: Role.DRIVER,
          driverProfile: {
            vehicleBrand: row.vehicleBrand ?? null,
            vehicleKind: row.vehicleKind ?? null,
            vehicleColor: row.vehicleColor ?? null,
            plateNumber: row.plateNumber ?? null
          }
        });
        created.push({ id: user.id, fullName: user.fullName, phone: user.phone });
      } catch (err) {
        failed.push({
          row: index + 1,
          fullName: row.fullName,
          reason: err instanceof AppError ? err.message : "تعذر إنشاء السائق"
        });
      }
    }

    return { createdCount: created.length, failed, created };
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
  },

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        expoPushToken: true,
        driver: {
          select: {
            id: true,
            vehicleBrand: true,
            vehicleKind: true,
            vehicleColor: true,
            vehicleNumber: true,
            isOnline: true,
            isBusy: true
          }
        },
        coordinator: { select: { id: true } }
      }
    });
    if (!user) throw new AppError("المستخدم غير موجود", 404);

    let coordinator = user.coordinator;
    if (user.role === Role.COORDINATOR && !coordinator) {
      coordinator = await prisma.coordinator.upsert({
        where: { userId },
        update: {},
        create: { userId },
        select: { id: true }
      });
    }

    const stats = {
      completedOrders: 0,
      pendingOrders: 0,
      inProgressOrders: 0,
      dueCommissionAmount: "0.00",
      totalPaidCommissions: "0.00"
    };

    if (user.driver) {
      const driverId = user.driver.id;
      const [completedOrders, pendingOrders, inProgressOrders, balance] = await Promise.all([
        prisma.order.count({ where: { driverId, status: OrderStatus.COMPLETED } }),
        prisma.order.count({ where: { driverId, status: OrderStatus.PENDING } }),
        prisma.order.count({ where: { driverId, status: { in: IN_PROGRESS_ORDER_STATUSES } } }),
        prisma.driverBalance.findUnique({ where: { driverId } })
      ]);
      stats.completedOrders = completedOrders;
      stats.pendingOrders = pendingOrders;
      stats.inProgressOrders = inProgressOrders;
      if (balance) {
        stats.dueCommissionAmount = balance.remainingDebt.toString();
        stats.totalPaidCommissions = balance.totalPaidCommissions.toString();
      }
    } else if (coordinator) {
      const coordinatorId = coordinator.id;
      const [completedOrders, pendingOrders, inProgressOrders] = await Promise.all([
        prisma.order.count({ where: { coordinatorId, status: OrderStatus.COMPLETED } }),
        prisma.order.count({ where: { coordinatorId, status: OrderStatus.PENDING } }),
        prisma.order.count({ where: { coordinatorId, status: { in: IN_PROGRESS_ORDER_STATUSES } } })
      ]);
      stats.completedOrders = completedOrders;
      stats.pendingOrders = pendingOrders;
      stats.inProgressOrders = inProgressOrders;
    }

    const { expoPushToken, driver, createdAt, ...rest } = user;

    return {
      ...rest,
      createdAt: createdAt.toISOString(),
      hasPushToken: Boolean(expoPushToken?.trim()),
      driver: driver
        ? {
            id: driver.id,
            vehicleBrand: driver.vehicleBrand,
            vehicleKind: driver.vehicleKind,
            vehicleColor: driver.vehicleColor,
            vehicleNumber: driver.vehicleNumber,
            isOnline: driver.isOnline,
            isBusy: driver.isBusy
          }
        : null,
      coordinator: coordinator ? { id: coordinator.id } : null,
      stats
    };
  },

  async listCoordinatorsForDriverUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, driver: { select: { id: true } } }
    });
    if (!user) throw new AppError("المستخدم غير موجود", 404);
    if (user.role !== Role.DRIVER || !user.driver) {
      throw new AppError("هذا المستخدم ليس سائقًا", 400);
    }

    const coordinators = await prisma.coordinator.findMany({
      where: {
        orders: { some: { driverId: user.driver.id } }
      },
      include: {
        user: { select: { fullName: true, phone: true } }
      },
      orderBy: { user: { fullName: "asc" } }
    });

    return coordinators.map((row) => ({
      id: row.id,
      fullName: row.user.fullName?.trim() || "—",
      phone: row.user.phone
    }));
  },

  async buildEmployeesExportXlsx() {
    const users = await prisma.user.findMany({
      select: {
        fullName: true,
        phone: true,
        driver: {
          select: {
            vehicleBrand: true,
            vehicleKind: true,
            vehicleColor: true,
            vehicleNumber: true
          }
        }
      },
      orderBy: [{ fullName: "asc" }]
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Taxi Office Admin";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("الموظفين", {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }]
    });

    sheet.columns = [
      { header: "الاسم", key: "fullName", width: 28 },
      { header: "رقم الهاتف", key: "phone", width: 18 },
      { header: "تفاصيل السيارة", key: "vehicleDetails", width: 42 }
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 22;

    for (const user of users) {
      sheet.addRow({
        fullName: user.fullName?.trim() || "—",
        phone: user.phone?.trim() || "—",
        vehicleDetails: formatVehicleDetails(user.driver)
      });
    }

    const filename = `الموظفين-${syriaTodayYmd()}.xlsx`;
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, filename };
  }
};
