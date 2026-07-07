import fs from "node:fs";
import path from "node:path";
import { ChatRoomType, OrderStatus, Prisma, Role } from "@prisma/client";
import type { ChatReceiptStatus } from "@taxi/config";
import { AppError } from "../../shared/app-error";
import { prisma } from "../../shared/prisma";
import { resolveChatImagePath } from "./chat-upload";
import { isChatUserOnline } from "./chat-presence";

const GLOBAL_ROOM_TITLE = "المحادثة العامة";
const MEDIA_TTL_MS = 24 * 60 * 60 * 1000;

export type ChatMessagePayload = {
  id: string;
  roomId: string;
  body: string | null;
  imageUrl: string | null;
  imageExpired: boolean;
  voiceUrl: string | null;
  voiceExpired: boolean;
  voiceDurationMs: number | null;
  sender: { id: string; fullName: string; role: Role };
  createdAt: string;
  receiptStatus?: ChatReceiptStatus;
};

export type ChatRoomPayload = {
  id: string;
  type: ChatRoomType;
  title: string;
  orderId: string | null;
  /** اسم الطرف الآخر في محادثة الطلب */
  peerName: string | null;
  /** مثال: طلب: البرانية بجانب سوق المدينة */
  orderLabel: string | null;
  /** للأدمن — اسم المنسق في محادثة الطلب */
  coordinatorName?: string | null;
  /** للأدمن — اسم السائق في محادثة الطلب */
  driverName?: string | null;
  /** عنوان الالتقاط (مصدر الطلب) */
  pickupAddress?: string | null;
  peerUserId: string | null;
  peerDriverId: string | null;
  peerOnline: boolean | null;
  orderAmount: string | null;
  orderStatus: OrderStatus | null;
  archivedAt: string | null;
  lastMessage: ChatMessagePayload | null;
  updatedAt: string;
};

export type ChatRoomListScope = "active" | "archived";

const orderChatSelect = {
  customerName: true,
  pickupAddress: true,
  amount: true,
  status: true,
  coordinator: { select: { user: { select: { id: true, fullName: true } } } },
  driver: { select: { id: true, isOnline: true, user: { select: { id: true, fullName: true } } } }
} as const;

type OrderChatMeta = {
  pickupAddress: string;
  amount: { toString(): string };
  status: OrderStatus;
  coordinator: { user: { id: string; fullName: string } };
  driver: { id: string; isOnline: boolean; user: { id: string; fullName: string } } | null;
};

function orderPickupLabel(order: { pickupAddress: string }) {
  return `طلب: ${order.pickupAddress}`;
}

function peerNameForOrder(order: OrderChatMeta, role: Role): string | null {
  if (role === Role.DRIVER) return order.coordinator.user.fullName;
  if (role === Role.COORDINATOR) return order.driver?.user.fullName ?? "سائق غير معيّن";
  return null;
}

function peerUserIdForOrder(order: OrderChatMeta, role: Role): string | null {
  if (role === Role.DRIVER) return order.coordinator.user.id;
  if (role === Role.COORDINATOR) return order.driver?.user.id ?? null;
  return null;
}

function peerDriverIdForOrder(order: OrderChatMeta, role: Role): string | null {
  if (role === Role.COORDINATOR && order.driver) return order.driver.id;
  return null;
}

function peerOnlineForOrder(order: OrderChatMeta, role: Role): boolean {
  if (role === Role.DRIVER) return isChatUserOnline(order.coordinator.user.id);
  if (role === Role.COORDINATOR && order.driver) {
    return order.driver.isOnline || isChatUserOnline(order.driver.user.id);
  }
  return false;
}

function roomPayloadFields(
  room: {
    type: ChatRoomType;
    title: string | null;
    order: OrderChatMeta | null;
  },
  role: Role
): Pick<
  ChatRoomPayload,
  | "title"
  | "peerName"
  | "orderLabel"
  | "coordinatorName"
  | "driverName"
  | "pickupAddress"
  | "peerUserId"
  | "peerDriverId"
  | "peerOnline"
  | "orderAmount"
  | "orderStatus"
> {
  if (room.type === ChatRoomType.GLOBAL) {
    return {
      title: GLOBAL_ROOM_TITLE,
      peerName: null,
      orderLabel: null,
      coordinatorName: null,
      driverName: null,
      pickupAddress: null,
      peerUserId: null,
      peerDriverId: null,
      peerOnline: null,
      orderAmount: null,
      orderStatus: null
    };
  }
  const order = room.order;
  if (!order) {
    return {
      title: room.title ?? GLOBAL_ROOM_TITLE,
      peerName: null,
      orderLabel: null,
      coordinatorName: null,
      driverName: null,
      pickupAddress: null,
      peerUserId: null,
      peerDriverId: null,
      peerOnline: false,
      orderAmount: null,
      orderStatus: null
    };
  }
  const coordinatorName = order.coordinator.user.fullName;
  const driverName = order.driver?.user.fullName ?? "سائق غير معيّن";
  const pickupAddress = order.pickupAddress;
  const peerName = peerNameForOrder(order, role);
  const orderLabel = orderPickupLabel(order);

  if (role === Role.ADMIN) {
    return {
      title: `${coordinatorName} -- ${driverName}`,
      peerName: null,
      orderLabel,
      coordinatorName,
      driverName,
      pickupAddress,
      peerUserId: null,
      peerDriverId: order.driver?.id ?? null,
      peerOnline: null,
      orderAmount: order.amount.toString(),
      orderStatus: order.status
    };
  }

  return {
    title: peerName ?? room.title ?? GLOBAL_ROOM_TITLE,
    peerName,
    orderLabel,
    coordinatorName: null,
    driverName: null,
    pickupAddress: null,
    peerUserId: peerUserIdForOrder(order, role),
    peerDriverId: peerDriverIdForOrder(order, role),
    peerOnline: peerOnlineForOrder(order, role),
    orderAmount: order.amount.toString(),
    orderStatus: order.status
  };
}

function messageToPayload(
  row: {
    id: string;
    roomId: string;
    body: string | null;
    imagePath: string | null;
    imageExpiresAt: Date | null;
    voicePath: string | null;
    voiceExpiresAt: Date | null;
    voiceDurationMs: number | null;
    createdAt: Date;
    sender: { id: string; fullName: string; role: Role };
  },
  apiBase: string
): ChatMessagePayload {
  const imageExpired =
    !!row.imagePath && !!row.imageExpiresAt && row.imageExpiresAt.getTime() <= Date.now();
  const voiceExpired =
    !!row.voicePath && !!row.voiceExpiresAt && row.voiceExpiresAt.getTime() <= Date.now();
  return {
    id: row.id,
    roomId: row.roomId,
    body: row.body,
    imageUrl:
      row.imagePath && !imageExpired
        ? `${apiBase}/chat/images/${path.basename(row.imagePath)}`
        : null,
    imageExpired: !!row.imagePath && imageExpired,
    voiceUrl:
      row.voicePath && !voiceExpired
        ? `${apiBase}/chat/voice/${path.basename(row.voicePath)}`
        : null,
    voiceExpired: !!row.voicePath && voiceExpired,
    voiceDurationMs: row.voiceDurationMs,
    sender: {
      id: row.sender.id,
      fullName: row.sender.fullName,
      role: row.sender.role
    },
    createdAt: row.createdAt.toISOString()
  };
}

type ReceiptRow = { userId: string; deliveredAt: Date | null; readAt: Date | null };

function computeReceiptStatus(receipts: ReceiptRow[], senderUserId: string): ChatReceiptStatus {
  const others = receipts.filter((r) => r.userId !== senderUserId);
  if (others.length === 0) return "sent";
  if (others.some((r) => r.readAt)) return "read";
  if (others.some((r) => r.deliveredAt)) return "delivered";
  return "sent";
}

async function receiptStatusForMessage(messageId: string, senderUserId: string): Promise<ChatReceiptStatus> {
  const receipts = await prisma.chatMessageReceipt.findMany({ where: { messageId } });
  return computeReceiptStatus(receipts, senderUserId);
}

async function getUserContext(userId: string, role: Role) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      coordinator: { select: { id: true } },
      driver: { select: { id: true } }
    }
  });
  if (!user || !user.isActive) {
    throw new AppError("Unauthorized", 401);
  }
  return {
    userId: user.id,
    role: user.role,
    coordinatorId: user.coordinator?.id ?? null,
    driverId: user.driver?.id ?? null
  };
}

async function assertRoomAccess(
  roomId: string,
  userId: string,
  role: Role,
  coordinatorId: string | null,
  driverId: string | null
) {
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    include: {
      order: {
        select: { id: true, coordinatorId: true, driverId: true, customerName: true }
      }
    }
  });
  if (!room) throw new AppError("المحادثة غير موجودة", 404);

  if (room.archivedAt && role !== Role.ADMIN) {
    throw new AppError("المحادثة غير موجودة", 404);
  }

  if (room.type === ChatRoomType.GLOBAL) {
    return room;
  }

  const order = room.order;
  if (!order) throw new AppError("المحادثة غير موجودة", 404);

  if (role === Role.ADMIN) return room;
  if (role === Role.COORDINATOR && coordinatorId && order.coordinatorId === coordinatorId) return room;
  if (role === Role.DRIVER && driverId && order.driverId === driverId) return room;

  throw new AppError("Forbidden", 403);
}

function assertRoomWritable(room: { archivedAt: Date | null; type: ChatRoomType }, role: Role) {
  if (room.archivedAt) {
    throw new AppError("المحادثة مؤرشفة ولا يمكن الإرسال فيها", 403);
  }
  if (room.type === ChatRoomType.GLOBAL && role === Role.DRIVER) {
    throw new AppError("المحادثة العامة للقراءة فقط", 403);
  }
}

function buildRoomSearchWhere(q: string) {
  const term = q.trim();
  if (!term) return undefined;
  return {
    OR: [
      { title: { contains: term, mode: "insensitive" as const } },
      { order: { pickupAddress: { contains: term, mode: "insensitive" as const } } },
      { order: { customerName: { contains: term, mode: "insensitive" as const } } },
      { order: { coordinator: { user: { fullName: { contains: term, mode: "insensitive" as const } } } } },
      { order: { driver: { user: { fullName: { contains: term, mode: "insensitive" as const } } } } },
      { messages: { some: { body: { contains: term, mode: "insensitive" as const } } } }
    ]
  };
}

export const chatService = {
  async ensureGlobalRoom() {
    const existing = await prisma.chatRoom.findFirst({
      where: { type: ChatRoomType.GLOBAL, archivedAt: null }
    });
    if (existing) return existing;
    return prisma.chatRoom.create({
      data: { type: ChatRoomType.GLOBAL, title: GLOBAL_ROOM_TITLE }
    });
  },

  async ensureOrderRoom(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerName: true, pickupAddress: true }
    });
    if (!order) throw new AppError("الطلب غير موجود", 404);

    const existing = await prisma.chatRoom.findUnique({ where: { orderId } });
    if (existing) return existing;

    const title = `طلب: ${order.customerName}`;
    return prisma.chatRoom.create({
      data: {
        type: ChatRoomType.ORDER,
        orderId,
        title
      }
    });
  },

  /** أرشفة محادثة الطلب تلقائيًا عند اكتماله (idempotent). */
  async archiveOrderRoomByOrderId(
    orderId: string,
    opts?: { archivedByUserId?: string | null; tx?: Prisma.TransactionClient }
  ): Promise<boolean> {
    const db = opts?.tx ?? prisma;
    const room = await db.chatRoom.findUnique({ where: { orderId } });
    if (!room || room.archivedAt) return false;
    await db.chatRoom.update({
      where: { id: room.id },
      data: {
        archivedAt: new Date(),
        archivedByUserId: opts?.archivedByUserId ?? null
      }
    });
    return true;
  },

  /** أرشفة محادثات الطلبات المكتملة التي لم تُؤرشف بعد (تشغيل عند الإقلاع). */
  async archiveRoomsForCompletedOrders(): Promise<number> {
    const result = await prisma.chatRoom.updateMany({
      where: {
        type: ChatRoomType.ORDER,
        archivedAt: null,
        order: { status: OrderStatus.COMPLETED }
      },
      data: {
        archivedAt: new Date(),
        archivedByUserId: null
      }
    });
    if (result.count > 0) {
      // eslint-disable-next-line no-console
      console.log(`[chat] archived ${result.count} room(s) for completed orders`);
    }
    return result.count;
  },

  async listRooms(
    userId: string,
    role: Role,
    apiBase: string,
    scope: ChatRoomListScope = "active",
    q?: string
  ): Promise<ChatRoomPayload[]> {
    const ctx = await getUserContext(userId, role);
    const searchWhere = q ? buildRoomSearchWhere(q) : undefined;

    const mapRoom = (room: {
      id: string;
      type: ChatRoomType;
      title: string | null;
      orderId: string | null;
      updatedAt: Date;
      archivedAt: Date | null;
      order: OrderChatMeta | null;
      messages: Array<{
        id: string;
        roomId: string;
        body: string | null;
        imagePath: string | null;
        imageExpiresAt: Date | null;
        voicePath: string | null;
        voiceExpiresAt: Date | null;
        voiceDurationMs: number | null;
        createdAt: Date;
        sender: { id: string; fullName: string; role: Role };
      }>;
    }): ChatRoomPayload => {
      const last = room.messages[0];
      const fields = roomPayloadFields(room, role);
      return {
        id: room.id,
        type: room.type,
        orderId: room.orderId,
        ...fields,
        archivedAt: room.archivedAt?.toISOString() ?? null,
        lastMessage: last ? messageToPayload(last, apiBase) : null,
        updatedAt: room.updatedAt.toISOString()
      };
    };

    const roomInclude = {
      order: { select: orderChatSelect },
      messages: {
        orderBy: { createdAt: "desc" as const },
        take: 1,
        include: { sender: { select: { id: true, fullName: true, role: true } } }
      }
    };

    if (role === Role.ADMIN && scope === "archived") {
      const archivedRooms = await prisma.chatRoom.findMany({
        where: { archivedAt: { not: null }, ...(searchWhere ?? {}) },
        orderBy: { archivedAt: "desc" },
        take: 100,
        include: roomInclude
      });
      return archivedRooms.map(mapRoom);
    }

    const globalRoom = await this.ensureGlobalRoom();

    let orderRooms: Array<{
      id: string;
      type: ChatRoomType;
      title: string | null;
      orderId: string | null;
      updatedAt: Date;
      archivedAt: Date | null;
      order: OrderChatMeta | null;
      messages: Array<{
        id: string;
        roomId: string;
        body: string | null;
        imagePath: string | null;
        imageExpiresAt: Date | null;
        voicePath: string | null;
        voiceExpiresAt: Date | null;
        voiceDurationMs: number | null;
        createdAt: Date;
        sender: { id: string; fullName: string; role: Role };
      }>;
    }> = [];

    if (role === Role.ADMIN) {
      orderRooms = await prisma.chatRoom.findMany({
        where: { type: ChatRoomType.ORDER, archivedAt: null, ...(searchWhere ?? {}) },
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: roomInclude
      });
    } else if (role === Role.COORDINATOR && ctx.coordinatorId) {
      orderRooms = await prisma.chatRoom.findMany({
        where: {
          type: ChatRoomType.ORDER,
          archivedAt: null,
          order: { coordinatorId: ctx.coordinatorId },
          ...(searchWhere ?? {})
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: roomInclude
      });
    } else if (role === Role.DRIVER && ctx.driverId) {
      orderRooms = await prisma.chatRoom.findMany({
        where: {
          type: ChatRoomType.ORDER,
          archivedAt: null,
          order: { driverId: ctx.driverId },
          ...(searchWhere ?? {})
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: roomInclude
      });
    }

    const globalWithLast = searchWhere
      ? await prisma.chatRoom.findFirst({
          where: { id: globalRoom.id, ...searchWhere },
          include: roomInclude
        })
      : await prisma.chatRoom.findUnique({
          where: { id: globalRoom.id },
          include: roomInclude
        });

    const globalPayload = globalWithLast
      ? mapRoom(globalWithLast)
      : searchWhere
        ? null
        : mapRoom({ ...globalRoom, order: null, messages: [], archivedAt: null });

    const orderPayloads = orderRooms.map(mapRoom);
    return globalPayload ? [globalPayload, ...orderPayloads] : orderPayloads;
  },

  async listMessages(
    roomId: string,
    userId: string,
    role: Role,
    apiBase: string,
    cursor?: string,
    limit = 40
  ) {
    const ctx = await getUserContext(userId, role);
    await assertRoomAccess(roomId, userId, role, ctx.coordinatorId, ctx.driverId);

    const roomRow = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { order: { select: orderChatSelect } }
    });
    if (!roomRow) throw new AppError("المحادثة غير موجودة", 404);

    const rows = await prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { sender: { select: { id: true, fullName: true, role: true } } }
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const ownIds = page.filter((m) => m.senderUserId === userId).map((m) => m.id);
    const receiptRows =
      ownIds.length > 0
        ? await prisma.chatMessageReceipt.findMany({ where: { messageId: { in: ownIds } } })
        : [];
    const receiptsByMessage = new Map<string, ReceiptRow[]>();
    for (const row of receiptRows) {
      const list = receiptsByMessage.get(row.messageId) ?? [];
      list.push(row);
      receiptsByMessage.set(row.messageId, list);
    }

    return {
      room: {
        ...roomPayloadFields(roomRow, role),
        orderId: roomRow.orderId,
        archivedAt: roomRow.archivedAt?.toISOString() ?? null
      },
      messages: page.reverse().map((m) => {
        const payload = messageToPayload(m, apiBase);
        if (m.senderUserId === userId) {
          payload.receiptStatus = computeReceiptStatus(receiptsByMessage.get(m.id) ?? [], userId);
        }
        return payload;
      }),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null
    };
  },

  async markDelivered(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { id: true, senderUserId: true }
    });
    if (!message || message.senderUserId === userId) return null;

    const existing = await prisma.chatMessageReceipt.findUnique({
      where: { messageId_userId: { messageId, userId } }
    });
    if (existing?.deliveredAt) {
      return {
        senderUserId: message.senderUserId,
        status: await receiptStatusForMessage(messageId, message.senderUserId)
      };
    }

    const now = new Date();
    await prisma.chatMessageReceipt.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId, deliveredAt: now },
      update: { deliveredAt: now }
    });
    return {
      senderUserId: message.senderUserId,
      status: await receiptStatusForMessage(messageId, message.senderUserId)
    };
  },

  async markRoomRead(roomId: string, userId: string, role: Role) {
    const ctx = await getUserContext(userId, role);
    await assertRoomAccess(roomId, userId, role, ctx.coordinatorId, ctx.driverId);

    const messages = await prisma.chatMessage.findMany({
      where: { roomId, senderUserId: { not: userId } },
      select: {
        id: true,
        senderUserId: true,
        receipts: { where: { userId }, select: { readAt: true, deliveredAt: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    });

    const now = new Date();
    const updates: Array<{ messageId: string; senderUserId: string; status: ChatReceiptStatus }> = [];

    for (const msg of messages) {
      const hadRead = msg.receipts[0]?.readAt;
      await prisma.chatMessageReceipt.upsert({
        where: { messageId_userId: { messageId: msg.id, userId } },
        create: { messageId: msg.id, userId, deliveredAt: now, readAt: now },
        update: {
          deliveredAt: msg.receipts[0]?.deliveredAt ?? now,
          readAt: now
        }
      });
      if (!hadRead) {
        const status = await receiptStatusForMessage(msg.id, msg.senderUserId);
        updates.push({ messageId: msg.id, senderUserId: msg.senderUserId, status });
      }
    }

    return updates;
  },

  async markRoomReadByUserId(roomId: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true }
    });
    if (!user?.isActive) return [];
    try {
      return await this.markRoomRead(roomId, userId, user.role);
    } catch (e) {
      if (e instanceof AppError && e.statusCode === 404) return [];
      throw e;
    }
  },

  async sendTextMessage(roomId: string, userId: string, role: Role, body: string, apiBase: string) {
    const ctx = await getUserContext(userId, role);
    const room = await assertRoomAccess(roomId, userId, role, ctx.coordinatorId, ctx.driverId);
    assertRoomWritable(room, role);

    const message = await prisma.chatMessage.create({
      data: { roomId, senderUserId: userId, body },
      include: { sender: { select: { id: true, fullName: true, role: true } } }
    });
    await prisma.chatRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } });
    return { ...messageToPayload(message, apiBase), receiptStatus: "sent" as const };
  },

  async sendImageMessage(
    roomId: string,
    userId: string,
    role: Role,
    filename: string,
    caption: string | undefined,
    apiBase: string
  ) {
    const ctx = await getUserContext(userId, role);
    const room = await assertRoomAccess(roomId, userId, role, ctx.coordinatorId, ctx.driverId);
    assertRoomWritable(room, role);

    const expiresAt = new Date(Date.now() + MEDIA_TTL_MS);
    const message = await prisma.chatMessage.create({
      data: {
        roomId,
        senderUserId: userId,
        body: caption?.trim() || null,
        imagePath: filename,
        imageExpiresAt: expiresAt
      },
      include: { sender: { select: { id: true, fullName: true, role: true } } }
    });
    await prisma.chatRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } });
    return { ...messageToPayload(message, apiBase), receiptStatus: "sent" as const };
  },

  async sendVoiceMessage(
    roomId: string,
    userId: string,
    role: Role,
    filename: string,
    durationMs: number | undefined,
    apiBase: string
  ) {
    const ctx = await getUserContext(userId, role);
    const room = await assertRoomAccess(roomId, userId, role, ctx.coordinatorId, ctx.driverId);
    assertRoomWritable(room, role);

    const safeDuration =
      typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0
        ? Math.min(Math.round(durationMs), 15 * 60 * 1000)
        : null;
    const expiresAt = new Date(Date.now() + MEDIA_TTL_MS);
    const message = await prisma.chatMessage.create({
      data: {
        roomId,
        senderUserId: userId,
        voicePath: filename,
        voiceExpiresAt: expiresAt,
        voiceDurationMs: safeDuration
      },
      include: { sender: { select: { id: true, fullName: true, role: true } } }
    });
    await prisma.chatRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } });
    return { ...messageToPayload(message, apiBase), receiptStatus: "sent" as const };
  },

  async getOrderRoomForUser(orderId: string, userId: string, role: Role, apiBase: string) {
    const ctx = await getUserContext(userId, role);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        coordinatorId: true,
        driverId: true,
        customerName: true,
        pickupAddress: true,
        amount: true,
        status: true,
        coordinator: { select: { user: { select: { id: true, fullName: true } } } },
        driver: { select: { id: true, isOnline: true, user: { select: { id: true, fullName: true } } } }
      }
    });
    if (!order) throw new AppError("الطلب غير موجود", 404);

    if (role === Role.COORDINATOR && ctx.coordinatorId !== order.coordinatorId) {
      throw new AppError("Forbidden", 403);
    }
    if (role === Role.DRIVER && order.driverId !== ctx.driverId) {
      throw new AppError("Forbidden", 403);
    }

    const room = await this.ensureOrderRoom(orderId);
    if (room.archivedAt && role !== Role.ADMIN) {
      throw new AppError("محادثة هذا الطلب مؤرشفة", 404);
    }
    const orderMeta: OrderChatMeta = {
      pickupAddress: order.pickupAddress,
      amount: order.amount,
      status: order.status,
      coordinator: order.coordinator,
      driver: order.driver
    };
    const fields = roomPayloadFields({ type: room.type, title: room.title, order: orderMeta }, role);
    return {
      id: room.id,
      type: room.type,
      orderId: room.orderId,
      ...fields,
      archivedAt: room.archivedAt?.toISOString() ?? null,
      lastMessage: null,
      updatedAt: room.updatedAt.toISOString()
    } satisfies ChatRoomPayload;
  },

  async archiveRoom(roomId: string, userId: string, role: Role) {
    const ctx = await getUserContext(userId, role);
    if (role !== Role.ADMIN && role !== Role.COORDINATOR && role !== Role.DRIVER) {
      throw new AppError("Forbidden", 403);
    }
    const room = await assertRoomAccess(roomId, userId, role, ctx.coordinatorId, ctx.driverId);
    if (room.archivedAt) {
      throw new AppError("المحادثة مؤرشفة مسبقًا", 400);
    }
    if (room.type === ChatRoomType.GLOBAL) {
      throw new AppError("لا يمكن أرشفة المحادثة العامة", 400);
    }

    await prisma.chatRoom.update({
      where: { id: roomId },
      data: { archivedAt: new Date(), archivedByUserId: userId }
    });

    return { ok: true as const };
  },

  async assertImageAccess(filename: string, userId: string, role: Role) {
    const ctx = await getUserContext(userId, role);
    const safeName = path.basename(filename);
    const message = await prisma.chatMessage.findFirst({
      where: {
        OR: [{ imagePath: safeName }, { imagePath: { endsWith: `/${safeName}` } }]
      },
      include: { room: { include: { order: true } } }
    });
    if (!message?.imagePath) throw new AppError("الصورة غير موجودة", 404);
    if (message.imageExpiresAt && message.imageExpiresAt.getTime() <= Date.now()) {
      throw new AppError("انتهت صلاحية الصورة", 410);
    }
    await assertRoomAccess(message.roomId, userId, role, ctx.coordinatorId, ctx.driverId);
    return resolveChatImagePath(message.imagePath);
  },

  async assertVoiceAccess(filename: string, userId: string, role: Role) {
    const ctx = await getUserContext(userId, role);
    const safeName = path.basename(filename);
    const message = await prisma.chatMessage.findFirst({
      where: {
        OR: [{ voicePath: safeName }, { voicePath: { endsWith: `/${safeName}` } }]
      },
      include: { room: { include: { order: true } } }
    });
    if (!message?.voicePath) throw new AppError("الرسالة الصوتية غير موجودة", 404);
    if (message.voiceExpiresAt && message.voiceExpiresAt.getTime() <= Date.now()) {
      throw new AppError("انتهت صلاحية الرسالة الصوتية", 410);
    }
    await assertRoomAccess(message.roomId, userId, role, ctx.coordinatorId, ctx.driverId);
    return resolveChatImagePath(message.voicePath);
  },

  async cleanupExpiredImages() {
    const now = new Date();
    const expired = await prisma.chatMessage.findMany({
      where: {
        imagePath: { not: null },
        imageExpiresAt: { lte: now }
      },
      select: { id: true, imagePath: true }
    });

    let deleted = 0;
    for (const row of expired) {
      if (row.imagePath) {
        const full = resolveChatImagePath(row.imagePath);
        try {
          if (fs.existsSync(full)) {
            fs.unlinkSync(full);
            deleted += 1;
          }
        } catch {
          /* ignore */
        }
      }
      await prisma.chatMessage.update({
        where: { id: row.id },
        data: { imagePath: null, imageExpiresAt: null }
      });
    }
    return { scanned: expired.length, filesDeleted: deleted };
  },

  async cleanupExpiredVoice() {
    const now = new Date();
    const expired = await prisma.chatMessage.findMany({
      where: {
        voicePath: { not: null },
        voiceExpiresAt: { lte: now }
      },
      select: { id: true, voicePath: true }
    });

    let deleted = 0;
    for (const row of expired) {
      if (row.voicePath) {
        const full = resolveChatImagePath(row.voicePath);
        try {
          if (fs.existsSync(full)) {
            fs.unlinkSync(full);
            deleted += 1;
          }
        } catch {
          /* ignore */
        }
      }
      await prisma.chatMessage.update({
        where: { id: row.id },
        data: { voicePath: null, voiceExpiresAt: null, voiceDurationMs: null }
      });
    }
    return { scanned: expired.length, filesDeleted: deleted };
  }
};
