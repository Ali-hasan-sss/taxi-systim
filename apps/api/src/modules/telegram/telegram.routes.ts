import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { Server } from "socket.io";
import { z } from "zod";
import { dispatchNewPendingOrderToDrivers } from "../../socket";
import {
  ackResumeChats,
  createTelegramOrder,
  getTelegramFareQuote,
  isTelegramBotEnabled,
  listResumeChats,
  rememberPausedChat,
  resolveTelegramPlace
} from "./telegram.service";

export const telegramRouter = Router();

function secretsMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function requireBotSecret(header: string | undefined): boolean {
  const expected = process.env.TELEGRAM_BOT_SECRET?.trim() ?? "";
  if (!expected || !header) return false;
  return secretsMatch(header.trim(), expected);
}

const createDto = z.object({
  customerName: z.string().trim().max(80).default(""),
  customerPhone: z.string().trim().min(3).max(32),
  pickupAddress: z.string().trim().max(300).optional(),
  pickupLat: z.number().finite().optional(),
  pickupLng: z.number().finite().optional(),
  dropoffAddress: z.string().trim().min(2).max(300),
  notes: z.string().trim().max(2000).optional(),
  telegramChatId: z.string().trim().min(1).max(32)
});

telegramRouter.get("/status", async (req, res, next) => {
  try {
    if (!requireBotSecret(req.get("x-telegram-bot-secret"))) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }
    const quote = await getTelegramFareQuote();
    res.json({ enabled: await isTelegramBotEnabled(), ...quote });
  } catch (error) {
    next(error);
  }
});

const chatDto = z.object({ chatId: z.string().trim().min(1).max(32) });

telegramRouter.post("/paused-chat", async (req, res, next) => {
  try {
    if (!requireBotSecret(req.get("x-telegram-bot-secret"))) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }
    const body = chatDto.parse(req.body);
    await rememberPausedChat(body.chatId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

telegramRouter.get("/resume-notices", async (req, res, next) => {
  try {
    if (!requireBotSecret(req.get("x-telegram-bot-secret"))) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }
    res.json({ chatIds: await listResumeChats() });
  } catch (error) {
    next(error);
  }
});

telegramRouter.post("/resume-notices/ack", async (req, res, next) => {
  try {
    if (!requireBotSecret(req.get("x-telegram-bot-secret"))) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }
    const body = z.object({ chatIds: z.array(z.string().trim().min(1).max(32)).max(100) }).parse(req.body);
    await ackResumeChats(body.chatIds);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

telegramRouter.get("/fare", async (req, res, next) => {
  try {
    if (!requireBotSecret(req.get("x-telegram-bot-secret"))) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }
    res.json(await getTelegramFareQuote());
  } catch (error) {
    next(error);
  }
});

const placeDto = z.object({
  lat: z.number().finite(),
  lng: z.number().finite()
});

telegramRouter.post("/place", async (req, res, next) => {
  try {
    if (!requireBotSecret(req.get("x-telegram-bot-secret"))) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }
    const body = placeDto.parse(req.body);
    res.json({ place: await resolveTelegramPlace(body.lat, body.lng) });
  } catch (error) {
    next(error);
  }
});

telegramRouter.post("/orders", async (req, res, next) => {
  try {
    if (!requireBotSecret(req.get("x-telegram-bot-secret"))) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }
    const body = createDto.parse(req.body);
    const order = await createTelegramOrder(body);
    const io = req.app.get("io") as Server | undefined;
    if (io) await dispatchNewPendingOrderToDrivers(io, order);
    res.status(201).json({
      id: order.id,
      amount: order.amount.toString(),
      pickupAddress: order.pickupAddress,
      dropoffAddress: order.dropoffAddress
    });
  } catch (error) {
    next(error);
  }
});
