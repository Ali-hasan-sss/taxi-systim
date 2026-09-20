import { prisma } from "../../shared/prisma";
import { serializeNotification } from "../../shared/driver-notifications";

const LIST_LIMIT = 50;

export const notificationsService = {
  async listMine(userId: string) {
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
        select: { id: true, type: true, title: true, body: true, readAt: true, createdAt: true }
      }),
      prisma.notification.count({
        where: { userId, readAt: null }
      })
    ]);
    return {
      notifications: rows.map(serializeNotification),
      unreadCount
    };
  },

  async markRead(userId: string, ids?: string[]) {
    const now = new Date();
    await prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(ids?.length ? { id: { in: ids } } : {})
      },
      data: { readAt: now }
    });
    const unreadCount = await prisma.notification.count({
      where: { userId, readAt: null }
    });
    return { ok: true as const, unreadCount };
  }
};
