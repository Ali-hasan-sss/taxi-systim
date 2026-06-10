import type { Order } from "@prisma/client";
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { getPushTargetDriverUserIdsForNewOrder } from "../socket";
import { prisma } from "./prisma";

const expo = new Expo();

/** Payload for outbound pushes; `sound` defaults to `"default"` when omitted. */
export type ExpoPushPayload = Pick<ExpoPushMessage, "title" | "body"> & {
  data?: ExpoPushMessage["data"];
  sound?: ExpoPushMessage["sound"];
};

export type OrderPushType =
  | "NEW_ORDER"
  | "ORDER_ASSIGNED"
  | "ORDER_RESUMED"
  | "ORDER_NEEDS_INFO"
  | "ORDER_ACCEPTED"
  | "ORDER_STUCK"
  | "ORDER_COMPLETED"
  | "ORDER_NEEDS_INVOICE";

export type ChatPushType = "CHAT_MESSAGE";

export type ChatMessagePushPayload = {
  roomId: string;
  orderId: string | null;
  roomTitle: string;
  senderName: string;
  body: string | null;
  hasImage: boolean;
};

export async function sendExpoPush(
  tokens: string[],
  payload: ExpoPushPayload
): Promise<void> {
  const unique = [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
  const valid = unique.filter((t) => Expo.isExpoPushToken(t));
  if (valid.length === 0) return;

  const messages: ExpoPushMessage[] = valid.map((to) => ({
    to,
    sound: payload.sound ?? "default",
    title: payload.title,
    body: payload.body,
    data: payload.data,
    priority: "high",
    channelId: "default"
  }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (e) {
      console.error("[expo-push] send failed", e);
    }
  }
}

async function tokensForUserIds(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, expoPushToken: { not: null } },
    select: { expoPushToken: true }
  });
  return users.map((u) => u.expoPushToken!).filter(Boolean);
}

async function tokenForDriverId(driverId: string | null | undefined): Promise<string | null> {
  if (!driverId) return null;
  const row = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { user: { select: { expoPushToken: true } } }
  });
  return row?.user.expoPushToken ?? null;
}

async function tokenForCoordinatorId(coordinatorId: string): Promise<string | null> {
  const row = await prisma.coordinator.findUnique({
    where: { id: coordinatorId },
    select: { user: { select: { expoPushToken: true } } }
  });
  return row?.user.expoPushToken ?? null;
}

function shortLabel(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function pickupLine(order: Order): string {
  return order.pickupAddress.length > 100 ? `${order.pickupAddress.slice(0, 97)}…` : order.pickupAddress;
}

/** طلب معلّق جديد في غرفة السائقين */
export async function notifyDriversNewOrderPush(order: Order): Promise<void> {
  try {
    const userIds = await getPushTargetDriverUserIdsForNewOrder(order);
    const tokens = await tokensForUserIds(userIds);
    await sendExpoPush(tokens, {
      title: "طلب جديد",
      body: `من: ${pickupLine(order)}`,
      data: { type: "NEW_ORDER" satisfies OrderPushType, orderId: order.id }
    });
  } catch (e) {
    console.error("[expo-push] notifyDriversNewOrderPush", e);
  }
}

/** إسناد طلب معلّق لسائق محدد */
export async function notifyDriverOrderAssignedPush(order: Order): Promise<void> {
  try {
    const token = await tokenForDriverId(order.driverId);
    if (!token) return;
    await sendExpoPush([token], {
      title: "طلب مُسند إليك",
      body: `من: ${pickupLine(order)}`,
      data: { type: "ORDER_ASSIGNED" satisfies OrderPushType, orderId: order.id }
    });
  } catch (e) {
    console.error("[expo-push] notifyDriverOrderAssignedPush", e);
  }
}

/** إعادة طلب متعثّر لنفس السائق */
export async function notifyDriverOrderResumedPush(order: Order): Promise<void> {
  try {
    const token = await tokenForDriverId(order.driverId);
    if (!token) return;
    const name =
      order.customerName.length > 50 ? `${order.customerName.slice(0, 47)}…` : order.customerName;
    await sendExpoPush([token], {
      title: "طلب متعثّر — أُعيد إليك",
      body: `${name} — توجّه إلى الزبون`,
      data: { type: "ORDER_RESUMED" satisfies OrderPushType, orderId: order.id }
    });
  } catch (e) {
    console.error("[expo-push] notifyDriverOrderResumedPush", e);
  }
}

async function getCoordinatorOrderContext(orderId: string): Promise<{
  token: string | null;
  customerName: string;
  driverName: string;
} | null> {
  const row = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      customerName: true,
      coordinatorId: true,
      driver: {
        select: {
          user: {
            select: {
              fullName: true
            }
          }
        }
      }
    }
  });
  if (!row) return null;
  const token = await tokenForCoordinatorId(row.coordinatorId);
  return {
    token,
    customerName: row.customerName,
    driverName: row.driver?.user.fullName?.trim() || "سائق"
  };
}

/** الطلب في الطريق إلى الزبون — يحتاج إرسال معلومات السائق */
export async function notifyCoordinatorNeedsInfoPush(orderId: string): Promise<void> {
  try {
    const row = await getCoordinatorOrderContext(orderId);
    if (!row?.token) return;
    await sendExpoPush([row.token], {
      title: "أرسل معلومات السائق",
      body: `${shortLabel(row.customerName)} — ${shortLabel(row.driverName, 40)} في الطريق`,
      data: { type: "ORDER_NEEDS_INFO" satisfies OrderPushType, orderId }
    });
  } catch (e) {
    console.error("[expo-push] notifyCoordinatorNeedsInfoPush", e);
  }
}

/** @deprecated استخدم notifyCoordinatorNeedsInfoPush — للتوافق مع الإصدارات السابقة */
export async function notifyCoordinatorOrderAcceptedPush(orderId: string): Promise<void> {
  return notifyCoordinatorNeedsInfoPush(orderId);
}

/** طلب متعثّر — السائق لم يعثر على الزبون */
export async function notifyCoordinatorOrderStuckPush(order: Order): Promise<void> {
  try {
    const token = await tokenForCoordinatorId(order.coordinatorId);
    if (!token) return;
    const name = shortLabel(order.customerName);
    await sendExpoPush([token], {
      title: "طلب متعثّر",
      body: `${name} — السائق لم يعثر على الزبون`,
      data: { type: "ORDER_STUCK" satisfies OrderPushType, orderId: order.id }
    });
  } catch (e) {
    console.error("[expo-push] notifyCoordinatorOrderStuckPush", e);
  }
}

/** طلب مكتمل — يحتاج إرسال فاتورة للزبون */
export async function notifyCoordinatorOrderCompletedPush(orderId: string): Promise<void> {
  try {
    const row = await getCoordinatorOrderContext(orderId);
    if (!row?.token) return;
    await sendExpoPush([row.token], {
      title: "أرسل الفاتورة للزبون",
      body: `${shortLabel(row.customerName)} — اكتمل الطلب`,
      data: { type: "ORDER_NEEDS_INVOICE" satisfies OrderPushType, orderId }
    });
  } catch (e) {
    console.error("[expo-push] notifyCoordinatorOrderCompletedPush", e);
  }
}

function chatMessagePreview(message: ChatMessagePushPayload): string {
  const text = message.body?.trim();
  if (text) return shortLabel(text, 80);
  if (message.hasImage) return "أرسل صورة";
  return "رسالة جديدة";
}

/** رسالة محادثة جديدة — للمنسق أو السائق عند إغلاق التطبيق */
export async function notifyChatMessagePush(
  recipientUserIds: string[],
  message: ChatMessagePushPayload
): Promise<void> {
  try {
    const tokens = await tokensForUserIds(recipientUserIds);
    if (tokens.length === 0) return;

    const senderName = shortLabel(message.senderName, 40);
    const roomTitle = shortLabel(message.roomTitle, 30);
    await sendExpoPush(tokens, {
      title: `${senderName} — ${roomTitle}`,
      body: chatMessagePreview(message),
      data: {
        type: "CHAT_MESSAGE" satisfies ChatPushType,
        roomId: message.roomId,
        roomTitle: message.roomTitle,
        roomType: message.orderId ? "ORDER" : "GLOBAL",
        ...(message.orderId ? { orderId: message.orderId } : {})
      }
    });
  } catch (e) {
    console.error("[expo-push] notifyChatMessagePush", e);
  }
}
