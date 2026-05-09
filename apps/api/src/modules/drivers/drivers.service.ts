import { Role } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { getDriverLocationsForNearest } from "../../socket";

const ASSIGN_SEARCH_MIN_LEN = 2;
const ASSIGN_SEARCH_LIMIT = 30;

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
  async listLiveWithNames() {
    const locs = await getDriverLocationsForNearest();
    if (locs.length === 0) return [];

    const ids = locs.map((l) => l.driverId);
    const drivers = await prisma.driver.findMany({
      where: { id: { in: ids } },
      include: {
        user: { select: { fullName: true, phone: true } }
      }
    });
    const byId = new Map(drivers.map((d) => [d.id, d]));

    return locs.map((l) => {
      const row = byId.get(l.driverId);
      return {
        driverId: l.driverId,
        lat: l.lat,
        lng: l.lng,
        fullName: row?.user.fullName?.trim() || "سائق",
        phone: row?.user.phone ?? null,
        isBusy: row?.isBusy ?? false
      };
    });
  }
};
