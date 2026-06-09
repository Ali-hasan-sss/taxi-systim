import type { NextFunction, Response } from "express";
import type { Server } from "socket.io";
import fs from "node:fs";
import path from "node:path";
import type { AuthRequest } from "../../shared/auth";
import { AppError } from "../../shared/app-error";
import { listMessagesQueryDto, listRoomsQueryDto, sendMessageDto } from "./chat.dto";
import { chatService } from "./chat.service";
import { emitChatMessage, emitChatReceipt } from "./chat-socket";

function apiBaseFromRequest(req: AuthRequest) {
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost:4000";
  return `${proto}://${host}/api`;
}

export const chatController = {
  async listRooms(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = listRoomsQueryDto.parse(req.query);
      const scope = parsed.scope ?? "active";
      const rooms = await chatService.listRooms(
        req.auth!.userId,
        req.auth!.role,
        apiBaseFromRequest(req),
        scope
      );
      res.json({ rooms });
    } catch (e) {
      next(e);
    }
  },

  async listMessages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = listMessagesQueryDto.parse(req.query);
      const result = await chatService.listMessages(
        req.params.roomId,
        req.auth!.userId,
        req.auth!.role,
        apiBaseFromRequest(req),
        parsed.cursor,
        parsed.limit
      );
      res.json(result);
    } catch (e) {
      next(e);
    }
  },

  async sendMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const body = sendMessageDto.parse(req.body);
      const message = await chatService.sendTextMessage(
        req.params.roomId,
        req.auth!.userId,
        req.auth!.role,
        body.body,
        apiBaseFromRequest(req)
      );
      const io = req.app.get("io") as Server | undefined;
      if (io) await emitChatMessage(io, req.params.roomId, message, req.auth!.userId);
      res.status(201).json(message);
    } catch (e) {
      next(e);
    }
  },

  async uploadImage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file?.filename) {
        throw new AppError("لم يُرفَع ملف صورة", 400);
      }
      const caption = typeof req.body?.caption === "string" ? req.body.caption : undefined;
      const message = await chatService.sendImageMessage(
        req.params.roomId,
        req.auth!.userId,
        req.auth!.role,
        req.file.filename,
        caption,
        apiBaseFromRequest(req)
      );
      const io = req.app.get("io") as Server | undefined;
      if (io) await emitChatMessage(io, req.params.roomId, message, req.auth!.userId);
      res.status(201).json(message);
    } catch (e) {
      if (req.file?.filename) {
        try {
          fs.unlinkSync(path.join(req.file.destination, req.file.filename));
        } catch {
          /* ignore */
        }
      }
      next(e);
    }
  },

  async getOrderRoom(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const room = await chatService.getOrderRoomForUser(
        req.params.orderId,
        req.auth!.userId,
        req.auth!.role,
        apiBaseFromRequest(req)
      );
      res.json(room);
    } catch (e) {
      next(e);
    }
  },

  async markRoomRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const updates = await chatService.markRoomRead(
        req.params.roomId,
        req.auth!.userId,
        req.auth!.role
      );
      const io = req.app.get("io") as Server | undefined;
      if (io) {
        for (const row of updates) {
          emitChatReceipt(io, row.senderUserId, row.messageId, row.status);
        }
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },

  async archiveRoom(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await chatService.archiveRoom(req.params.roomId, req.auth!.userId, req.auth!.role);
      res.json(result);
    } catch (e) {
      next(e);
    }
  },

  async serveImage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const safeName = path.basename(req.params.filename ?? "");
      const filePath = await chatService.assertImageAccess(
        safeName,
        req.auth!.userId,
        req.auth!.role
      );
      if (!fs.existsSync(filePath)) {
        throw new AppError("الصورة غير موجودة", 404);
      }
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
      res.type(mime);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.sendFile(filePath);
    } catch (e) {
      next(e);
    }
  }
};
