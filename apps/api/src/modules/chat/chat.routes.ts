import { Router } from "express";
import { requireAuth } from "../../shared/auth";
import { chatController } from "./chat.controller";
import { chatImageUpload, chatVoiceUpload } from "./chat-upload";

export const chatRouter = Router();

chatRouter.get("/rooms", requireAuth, chatController.listRooms);
chatRouter.get("/rooms/:roomId/messages", requireAuth, chatController.listMessages);
chatRouter.post("/rooms/:roomId/messages", requireAuth, chatController.sendMessage);
chatRouter.post(
  "/rooms/:roomId/images",
  requireAuth,
  chatImageUpload.single("image"),
  chatController.uploadImage
);
chatRouter.post(
  "/rooms/:roomId/voice",
  requireAuth,
  chatVoiceUpload.single("voice"),
  chatController.uploadVoice
);
chatRouter.post("/rooms/:roomId/read", requireAuth, chatController.markRoomRead);
chatRouter.post("/rooms/:roomId/archive", requireAuth, chatController.archiveRoom);
chatRouter.get("/orders/:orderId/room", requireAuth, chatController.getOrderRoom);
chatRouter.get("/images/:filename", requireAuth, chatController.serveImage);
chatRouter.get("/voice/:filename", requireAuth, chatController.serveVoice);
