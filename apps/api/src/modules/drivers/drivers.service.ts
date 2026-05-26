import type { Server } from "socket.io";
import { Role } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { getConnectedOnlineDriverIds, getDriverLocationsForNearest } from "../../socket";

const ASSIGN_SEARCH_MIN_LEN = 2;
const ASSIGN_SEARCH_LIMIT = 30;
const LIVE_DRIVERS_PAGE_DEFAULT = 20;
const LIVE_DRIVERS_PAGE_MAX = 100;

export type LiveDriversStatusFilter = "all" | "available" | "busy";

async function syncMissingDriverRows() {
  const orphans = await prisma.user.findMany({
    where: { role: Role.DRIVER, isActive: true, driver: { is: null } },
    select: { id: true }
  });
  if (orphans.length === 0) return;
  await prisma.driver.createMany({
    data: orphans.map((u) => ({ userId: u.id })),
    skipDuplicates: true
  });
}

export const driversService = {
  async profileForDriver(userId: string) {
    await syncMissingDriverRows();
    const driver = await prisma.driver.findFirst({
      where: { userId, user: { role: Role.DRIVER, isActive: true } },
      select: { id: true, isBusy: true, isOnline: true }
    });
    if (!driver) throw new AppError("ملف السائق غير موجود", 404);
    return driver;
  },

  /** قائمة السائقين للإسناد (بحث بالاسم/الهاتف؛ لا نتائج إذا كان الاستعلام أقصر من حرفين) */
  async listForAssignment(qRaw?: string | null) {
    const q = typeof qRaw === "string" ? qRaw.trim() : "";
    if (q.length < ASSIGN_SEARCH_MIN_LEN) {
      return [];
    }

    await syncMissingDriverRows();

    const drivers = await prisma.driver.findMany({
      where: {
        user: {
          role: Role.DRIVER,
          isActive: true,
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } }
          ]
        }
      },
      include: {
        user: { select: { fullName: true, phone: true } }
      },
      orderBy: { user: { fullName: "asc" } },
      take: ASSIGN_SEARCH_LIMIT
    });
    return drivers.map((d) => ({
      id: d.id,
      fullName: d.user.fullName?.trim() || "سائق",
      phone: d.user.phone,
      isOnline: d.isOnline,
      isBusy: d.isBusy
    }));
  },

  /** سائقون متصلون (driver:online) ولديهم آخر موقع (driver:location) */
  async listLiveWithNames(
    io: Server,
    opts?: {
      q?: string | null;
      limit?: number;
      offset?: number;
      status?: LiveDriversStatusFilter;
      includeInactive?: boolean;
    }
  ) {
    await syncMissingDriverRows();
    const q = typeof opts?.q === "string" ? opts.q.trim() : "";
    const limit = Math.min(LIVE_DRIVERS_PAGE_MAX, Math.max(1, opts?.limit ?? LIVE_DRIVERS_PAGE_DEFAULT));
    const offset = Math.max(0, opts?.offset ?? 0);
    const status = opts?.status ?? "all";
    const includeInactive = opts?.includeInactive === true;
    const connectedIds = await getConnectedOnlineDriverIds(io);
    const connectedSet = new Set(connectedIds);

    if (connectedIds.length === 0 && !includeInactive) {
      return {
        drivers: [],
        total: 0,
        nextOffset: null,
        summary: {
          totalDrivers: 0,
          activeDrivers: 0,
          driversOnMap: 0
        }
      };
    }

    const where = {
      ...(includeInactive || connectedIds.length > 0 ? {} : { id: { in: ["__no_connected_drivers__"] } }),
      ...(status === "all" && !includeInactive ? { id: { in: connectedIds } } : {}),
      ...(status !== "all" ? { id: { in: connectedIds } } : {}),
      ...(status === "busy" ? { isBusy: true } : status === "available" ? { isBusy: false } : {}),
      user: {
        role: Role.DRIVER,
        isActive: true,
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q, mode: "insensitive" as const } }
              ]
            }
          : {})
      }
    };

    const [total, totalDrivers, activeDrivers, drivers, locs] = await Promise.all([
      prisma.driver.count({ where }),
      prisma.driver.count({
        where: {
          user: {
            role: Role.DRIVER,
            isActive: true,
            ...(q
              ? {
                  OR: [
                    { fullName: { contains: q, mode: "insensitive" as const } },
                    { phone: { contains: q, mode: "insensitive" as const } }
                  ]
                }
              : {})
          }
        }
      }),
      prisma.driver.count({
        where: {
          id: { in: connectedIds.length > 0 ? connectedIds : ["__no_connected_drivers__"] },
          user: {
            role: Role.DRIVER,
            isActive: true,
            ...(q
              ? {
                  OR: [
                    { fullName: { contains: q, mode: "insensitive" as const } },
                    { phone: { contains: q, mode: "insensitive" as const } }
                  ]
                }
              : {})
          }
        }
      }),
      prisma.driver.findMany({
        where,
        select: {
          id: true,
          isBusy: true,
          vehicleBrand: true,
          vehicleKind: true,
          vehicleColor: true,
          vehicleNumber: true,
          user: { select: { fullName: true, phone: true } }
        },
        orderBy: [{ isBusy: "asc" }, { user: { fullName: "asc" } }, { id: "asc" }],
        skip: offset,
        take: limit
      }),
      getDriverLocationsForNearest()
    ]);

    const locById = new Map(locs.map((l) => [l.driverId, l] as const));
    const items = drivers.map((d) => {
      const loc = locById.get(d.id);
      const isOnline = connectedSet.has(d.id);
      return {
        driverId: d.id,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        fullName: d.user.fullName?.trim() || "سائق",
        phone: d.user.phone ?? null,
        isBusy: isOnline ? d.isBusy : false,
        isOnline,
        status: isOnline ? (d.isBusy ? "busy" : "online") : "offline",
        vehicleBrand: d.vehicleBrand ?? null,
        vehicleKind: d.vehicleKind ?? null,
        vehicleColor: d.vehicleColor ?? null,
        vehicleNumber: d.vehicleNumber ?? null
      };
    });

    return {
      drivers: items,
      total,
      nextOffset: offset + items.length < total ? offset + items.length : null,
      summary: {
        totalDrivers,
        activeDrivers,
        driversOnMap: locs.filter((loc) => connectedSet.has(loc.driverId)).length
      }
    };
  }
};
