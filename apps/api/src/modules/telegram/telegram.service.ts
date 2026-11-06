import { OrderBroadcastTarget, OrderSource, OrderVehicleRequirement } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { nearestLandmarkName } from "../../shared/reverse-geocode";
import { isValidPhoneDigits, normalizePhoneDigits } from "../../shared/phone";
import { ordersService } from "../orders/orders.service";
import { ensureTelegramCoordinatorUserId } from "./telegram-coordinator";

const DEFAULT_MIN_FARE = 150;
const UNRESOLVED_PLACE = /أقرب معلم|موقع الخريطة|موقعك الحالي|\d+\.\d{3,}/;

function isResolvedPlace(value: string | null | undefined): value is string {
  const text = value?.trim() ?? "";
  return text.length >= 2 && !UNRESOLVED_PLACE.test(text);
}

export async function resolveTelegramPlace(lat: number, lng: number): Promise<string> {
  const place = await nearestLandmarkName(lat, lng);
  if (!isResolvedPlace(place)) {
    throw new AppError("تعذر تحديد أقرب معلم من الخريطة. أعد إرسال الموقع.", 422);
  }
  return place;
}

export async function getTelegramFareQuote(): Promise<{ minFare: number; per100mFare: number }> {
  const setting = await prisma.systemSettings.findFirst({
    where: { key: "commission" },
    select: { telegramMinFare: true, telegramPer100mFare: true }
  });
  const minFare = Number(setting?.telegramMinFare ?? DEFAULT_MIN_FARE);
  const per100mFare = Number(setting?.telegramPer100mFare ?? 10);
  return {
    minFare: Number.isFinite(minFare) && minFare > 0 ? minFare : DEFAULT_MIN_FARE,
    per100mFare: Number.isFinite(per100mFare) && per100mFare >= 0 ? per100mFare : 10
  };
}

export async function getTelegramMinFare(): Promise<number> {
  return (await getTelegramFareQuote()).minFare;
}

export async function isTelegramBotEnabled(): Promise<boolean> {
  const setting = await prisma.systemSettings.findFirst({
    where: { key: "commission" },
    select: { telegramBotEnabled: true }
  });
  return setting?.telegramBotEnabled !== false;
}

export async function rememberPausedChat(chatId: string): Promise<void> {
  const id = chatId.trim();
  if (!id) return;
  await prisma.telegramSubscriber.upsert({
    where: { chatId: id },
    update: { awaitingResumeNotice: true },
    create: { chatId: id, awaitingResumeNotice: true }
  });
}

export async function listResumeChats(): Promise<string[]> {
  const rows = await prisma.telegramSubscriber.findMany({
    where: { awaitingResumeNotice: true },
    select: { chatId: true },
    take: 100
  });
  return rows.map((row) => row.chatId);
}

export async function ackResumeChats(chatIds: string[]): Promise<void> {
  const ids = [...new Set(chatIds.map((id) => id.trim()).filter(Boolean))].slice(0, 100);
  if (ids.length === 0) return;
  await prisma.telegramSubscriber.updateMany({
    where: { chatId: { in: ids } },
    data: { awaitingResumeNotice: false }
  });
}

export async function createTelegramOrder(input: {
  customerName: string;
  customerPhone: string;
  pickupAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffAddress: string;
  notes?: string;
  telegramChatId?: string;
}) {
  if (!(await isTelegramBotEnabled())) {
    throw new AppError("البوت في حالة صيانة", 503);
  }
  const phone = normalizePhoneDigits(input.customerPhone);
  if (!isValidPhoneDigits(phone)) {
    throw new AppError("رقم التواصل غير صالح", 400);
  }

  const dropoff = input.dropoffAddress.trim();
  if (dropoff.length < 2) throw new AppError("اكتب وجهة الوصول", 400);

  const hasPoint = Number.isFinite(input.pickupLat) && Number.isFinite(input.pickupLng);
  let pickup = "";
  if (hasPoint) {
    try {
      pickup = await resolveTelegramPlace(input.pickupLat!, input.pickupLng!);
    } catch (error) {
      if (isResolvedPlace(input.pickupAddress)) pickup = input.pickupAddress.trim();
      else throw error;
    }
  } else {
    pickup = input.pickupAddress?.trim() ?? "";
  }
  if (!isResolvedPlace(pickup)) throw new AppError("مكان الانطلاق غير واضح", 400);

  const name = input.customerName.trim();
  const customerName = name.length >= 2 ? name.slice(0, 80) : `زبون ${phone}`;
  const amount = await getTelegramMinFare();
  const notes = ["طلب من تيليغرام", input.notes?.trim()].filter(Boolean).join("\n").slice(0, 2000);

  const ownerId = await ensureTelegramCoordinatorUserId();
  const chatId = input.telegramChatId?.trim();

  const created = await ordersService.createOrder(
    ownerId,
    {
      customerName,
      customerPhone: phone,
      pickupAddress: pickup,
      dropoffAddress: dropoff,
      amount,
      notes,
      pickupLat: hasPoint ? input.pickupLat : undefined,
      pickupLng: hasPoint ? input.pickupLng : undefined,
      vehicleRequirement: OrderVehicleRequirement.ANY,
      broadcastTarget: OrderBroadcastTarget.ALL
    },
    { source: OrderSource.TELEGRAM, skipPromotions: true }
  );
  if (!chatId) return created;
  return prisma.order.update({
    where: { id: created.id },
    data: { telegramChatId: chatId }
  });
}
