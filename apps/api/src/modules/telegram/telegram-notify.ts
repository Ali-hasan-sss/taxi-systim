import { OrderSource, OrderStatus, type Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { TELEGRAM_COORDINATOR_NAME } from "./telegram-coordinator";

type NoticeOrder = Prisma.OrderGetPayload<{
  include: {
    driver: { include: { user: { select: { fullName: true; phone: true } } } };
  };
}>;

function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fareText(amount: { toString(): string }): string {
  const value = Number(amount.toString());
  if (!Number.isFinite(value)) return esc(amount.toString());
  return `${new Intl.NumberFormat("ar-SY", { maximumFractionDigits: 0 }).format(value)} ل.س`;
}

function driverLines(order: NoticeOrder): string[] {
  const driver = order.driver;
  const name = driver?.user.fullName?.trim() || "السائق";
  const brand = driver?.vehicleBrand?.trim() || "—";
  const color = driver?.vehicleColor?.trim() || "—";
  const plate = driver?.vehicleNumber?.trim() || "—";
  return [
    `👤 <b>اسم السائق:</b> ${esc(name)}`,
    `🚗 <b>نوع السيارة:</b> ${esc(brand)}`,
    `🎨 <b>لون السيارة:</b> ${esc(color)}`,
    `🔢 <b>رقم اللوحة:</b> ${esc(plate)}`
  ];
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || body.ok === false) {
      console.error("[telegram] send", body.description || res.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[telegram] send", error);
    return false;
  }
}

function canNotify(order: { source: OrderSource; telegramChatId: string | null }): order is { source: "TELEGRAM"; telegramChatId: string } {
  return order.source === OrderSource.TELEGRAM && Boolean(order.telegramChatId);
}

export async function notifyTelegramDriverAccepted(order: NoticeOrder): Promise<void> {
  if (!canNotify(order) || order.customerInfoSentAt) return;
  const sent = await sendTelegram(
    order.telegramChatId,
    ["🚖 <b>انقبل طلبك</b>", "السائق بطريقو لعندك.", "", ...driverLines(order)].join("\n")
  );
  if (!sent) return;
  await prisma.order.update({
    where: { id: order.id },
    data: { customerInfoSentAt: new Date() }
  });
}

export async function notifyTelegramDriverArrived(order: NoticeOrder, placeName?: string | null): Promise<void> {
  if (!canNotify(order)) return;
  const name = order.driver?.user.fullName?.trim() || "السائق";
  const place = placeName?.trim();
  const lines = [`📍 <b>السائق وصل لموقعك</b>`, `الكابتن : ${esc(name)} صار عندك.`];
  if (place) lines.push(`الموقع: ${esc(place)}`);
  await sendTelegram(order.telegramChatId, lines.join("\n"));
}

export async function notifyTelegramInvoice(order: NoticeOrder): Promise<void> {
  if (!canNotify(order) || order.invoiceSentAt || order.status !== OrderStatus.COMPLETED) return;
  const sent = await sendTelegram(
    order.telegramChatId,
    [
      "📝 <b>فاتورة الطلب</b>",
      `🎀 ${TELEGRAM_COORDINATOR_NAME}`,
      "",
      `💰 <b>الأجرة:</b> ${fareText(order.amount)}`,
      order.tripDistanceMeters != null ? `📏 <b>المسافة:</b> ${(order.tripDistanceMeters / 1000).toFixed(2)} كم` : "",
      `📍 <b>من:</b> ${esc(order.pickupAddress)}`,
      `🏁 <b>إلى:</b> ${esc(order.dropoffAddress)}`,
      "",
      "نحن بالخدمة شكرا لثقتك"
    ].join("\n")
  );
  if (!sent) return;
  await prisma.order.update({
    where: { id: order.id },
    data: { invoiceSentAt: new Date() }
  });
}
