import type { Server } from "socket.io";
import { ChatRoomType, Role } from "@prisma/client";
import { socketEvents, type ChatReceiptStatus } from "@taxi/config";
import { prisma } from "../../shared/prisma";
import type { ChatMessagePayload } from "./chat.service";

export const CHAT_GLOBAL_ROOM = "chat:global";

export function emitChatReceipt(
  io: Server,
  senderUserId: string,
  messageId: string,
  status: ChatReceiptStatus
) {
  io.to(`user:${senderUserId}`).emit(socketEvents.CHAT_RECEIPT, { messageId, status });
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
    select: { type: true }
  });
  if (!room) return;

  if (room.type === ChatRoomType.GLOBAL) {
    io.to(CHAT_GLOBAL_ROOM).emit(socketEvents.CHAT_MESSAGE, message);
    return;
  }

  const orderRoom = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: {
      order: {
        select: {
          coordinator: { select: { userId: true } },
          driver: { select: { userId: true } }
        }
      }
    }
  });

  const targets = new Set<string>();
  const coordUserId = orderRoom?.order?.coordinator?.userId;
  const driverUserId = orderRoom?.order?.driver?.userId;
  if (coordUserId) targets.add(coordUserId);
  if (driverUserId) targets.add(driverUserId);

  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN, isActive: true },
    select: { id: true }
  });
  for (const admin of admins) targets.add(admin.id);

  targets.delete(senderUserId);
  for (const userId of targets) {
    io.to(`user:${userId}`).emit(socketEvents.CHAT_MESSAGE, message);
  }
}
