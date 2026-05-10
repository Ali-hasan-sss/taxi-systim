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

export async function notifyDriversNewOrderPush(order: Order): Promise<void> {
  try {
    const userIds = await getPushTargetDriverUserIdsForNewOrder(order);
    if (userIds.length === 0) return;
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, expoPushToken: { not: null } },
      select: { expoPushToken: true }
    });
    const tokens = users.map((u) => u.expoPushToken!).filter(Boolean);
    const pickup =
      order.pickupAddress.length > 100 ? `${order.pickupAddress.slice(0, 97)}…` : order.pickupAddress;
    await sendExpoPush(tokens, {
      title: "طلب جديد",
      body: `من: ${pickup}`,
      data: { type: "NEW_ORDER", orderId: order.id }
    });
  } catch (e) {
    console.error("[expo-push] notifyDriversNewOrderPush", e);
  }
}

export async function notifyCoordinatorOrderStuckPush(order: Order): Promise<void> {
  try {
    const coord = await prisma.coordinator.findUnique({
      where: { id: order.coordinatorId },
      select: { userId: true }
    });
    if (!coord) return;
    const user = await prisma.user.findUnique({
      where: { id: coord.userId },
      select: { expoPushToken: true }
    });
    const token = user?.expoPushToken;
    if (!token) return;
    const name =
      order.customerName.length > 60 ? `${order.customerName.slice(0, 57)}…` : order.customerName;
    await sendExpoPush([token], {
      title: "طلب متعثّر",
      body: `${name} — السائق لم يعثر على الزبون`,
      data: { type: "ORDER_STUCK", orderId: order.id }
    });
  } catch (e) {
    console.error("[expo-push] notifyCoordinatorOrderStuckPush", e);
  }
}
