import type { Server } from "socket.io";
import { ChatRoomType, Role } from "@prisma/client";
import { socketEvents, type ChatReceiptStatus } from "@taxi/config";
import { notifyChatMessagePush } from "../../shared/expo-push";
import { prisma } from "../../shared/prisma";
import type { ChatMessagePayload } from "./chat.service";

export const CHAT_GLOBAL_ROOM = "chat:global";
const GLOBAL_ROOM_TITLE = "المحادثة العامة";

export function emitChatReceipt(
  io: Server,
  senderUserId: string,
  messageId: string,
  status: ChatReceiptStatus
) {
  io.to(`user:${senderUserId}`).emit(socketEvents.CHAT_RECEIPT, { messageId, status });
}

async function chatMessageRecipientUserIds(
  room: {
    type: ChatRoomType;
    order: {
      coordinator: { userId: string } | null;
      driver: { userId: string } | null;
    } | null;
  },
  senderUserId: string
): Promise<string[]> {
  const targets = new Set<string>();

  if (room.type === ChatRoomType.GLOBAL) {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [Role.COORDINATOR, Role.DRIVER, Role.ADMIN] }
      },
      select: { id: true }
    });
    for (const user of users) targets.add(user.id);
  } else {
    const coordUserId = room.order?.coordinator?.userId;
    const driverUserId = room.order?.driver?.userId;
    if (coordUserId) targets.add(coordUserId);
    if (driverUserId) targets.add(driverUserId);

    const admins = await prisma.user.findMany({
      where: { role: Role.ADMIN, isActive: true },
      select: { id: true }
    });
    for (const admin of admins) targets.add(admin.id);
  }

  targets.delete(senderUserId);
  return [...targets];
}

function roomTitleForPush(room: {
  type: ChatRoomType;
  title: string | null;
  order: { customerName: string } | null;
}): string {
  if (room.type === ChatRoomType.GLOBAL) return GLOBAL_ROOM_TITLE;
  if (room.order?.customerName) return `طلب: ${room.order.customerName}`;
  return room.title ?? GLOBAL_ROOM_TITLE;
}

export async function emitChatMessage(
  io: Server,
  roomId: string,
  message: ChatMessagePayload,
  senderUserId: string
) {
  io.to(`chat:${roomId}`).emit(socketEvents.CHAT_MESSAGE, message);

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: {
      type: true,
      title: true,
      orderId: true,
      order: {
        select: {
          customerName: true,
          coordinator: { select: { userId: true } },
          driver: { select: { userId: true } }
        }
      }
    }
  });
  if (!room) return;

  const recipients = await chatMessageRecipientUserIds(room, senderUserId);

  if (room.type === ChatRoomType.GLOBAL) {
    io.to(CHAT_GLOBAL_ROOM).emit(socketEvents.CHAT_MESSAGE, message);
  } else {
    for (const userId of recipients) {
      io.to(`user:${userId}`).emit(socketEvents.CHAT_MESSAGE, message);
    }
  }

  void notifyChatMessagePush(recipients, {
    messageId: message.id,
    roomId: message.roomId,
    orderId: room.orderId,
    roomTitle: roomTitleForPush(room),
    senderName: message.sender.fullName,
    body: message.body,
    hasImage: !!message.imageUrl
  });
}
