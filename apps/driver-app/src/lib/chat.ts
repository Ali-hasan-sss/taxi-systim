import { resolveExpoApiBase } from "@taxi/expo-api-base";
import { getDriverSession, tryRefreshDriverSession } from "./session";

const API_BASE = resolveExpoApiBase();

export type ChatMessageRow = {
  id: string;
  roomId: string;
  body: string | null;
  imageUrl: string | null;
  imageExpired: boolean;
  voiceUrl: string | null;
  voiceExpired: boolean;
  voiceDurationMs: number | null;
  sender: { id: string; fullName: string; role: string };
  createdAt: string;
  receiptStatus?: "sent" | "delivered" | "read";
};

export type ChatRoomRow = {
  id: string;
  type: "GLOBAL" | "ORDER";
  title: string;
  orderId: string | null;
  peerName: string | null;
  orderLabel: string | null;
  peerUserId: string | null;
  peerDriverId: string | null;
  peerOnline: boolean | null;
  archivedAt: string | null;
  lastMessage: ChatMessageRow | null;
  updatedAt: string;
};

export type ChatRoomHeader = Pick<
  ChatRoomRow,
  "title" | "peerName" | "orderLabel" | "peerUserId" | "peerDriverId" | "peerOnline"
>;

export function chatRoomListTitle(room: ChatRoomRow): string {
  if (room.type === "GLOBAL") return room.title;
  return room.peerName ?? room.title;
}

export function chatRoomHref(room: ChatRoomRow): string {
  const params = new URLSearchParams({ title: chatRoomListTitle(room), roomType: room.type });
  if (room.orderLabel) params.set("subtitle", room.orderLabel);
  return `/chat/${room.id}?${params.toString()}`;
}

export function chatRoomHrefFallback(
  roomId: string,
  title: string,
  roomType: ChatRoomRow["type"] = "ORDER",
  subtitle?: string | null
): string {
  const params = new URLSearchParams({ title, roomType });
  if (subtitle) params.set("subtitle", subtitle);
  return `/chat/${roomId}?${params.toString()}`;
}

async function chatFetch(path: string, init: RequestInit, accessToken: string): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const run = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Cache-Control", "no-cache");
    return fetch(url, { ...init, headers });
  };
  let res = await run(accessToken);
  if (res.status !== 401) return res;
  const next = await tryRefreshDriverSession();
  if (!next) return res;
  return run(next.accessToken);
}

export async function listChatRooms(): Promise<ChatRoomRow[]> {
  const session = await getDriverSession();
  if (!session) throw new Error("يجب تسجيل الدخول");
  const res = await chatFetch("/chat/rooms", {}, session.accessToken);
  const body = (await res.json().catch(() => ({}))) as { rooms?: ChatRoomRow[]; message?: string };
  if (!res.ok) throw new Error(body.message ?? "تعذر تحميل المحادثات");
  return body.rooms ?? [];
}

export async function listChatMessages(
  roomId: string,
  cursor?: string
): Promise<{ messages: ChatMessageRow[]; nextCursor: string | null; room: ChatRoomHeader }> {
  const session = await getDriverSession();
  if (!session) throw new Error("يجب تسجيل الدخول");
  const qs = new URLSearchParams();
  if (cursor) qs.set("cursor", cursor);
  const res = await chatFetch(`/chat/rooms/${roomId}/messages?${qs}`, {}, session.accessToken);
  const body = (await res.json().catch(() => ({}))) as {
    messages?: ChatMessageRow[];
    nextCursor?: string | null;
    room?: ChatRoomHeader;
    message?: string;
  };
  if (!res.ok) throw new Error(body.message ?? "تعذر تحميل الرسائل");
  return {
    messages: body.messages ?? [],
    nextCursor: body.nextCursor ?? null,
    room: body.room ?? {
      title: "",
      peerName: null,
      orderLabel: null,
      peerUserId: null,
      peerDriverId: null,
      peerOnline: null
    }
  };
}

export async function sendChatMessage(roomId: string, text: string): Promise<ChatMessageRow> {
  const session = await getDriverSession();
  if (!session) throw new Error("يجب تسجيل الدخول");
  const res = await chatFetch(
    `/chat/rooms/${roomId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text })
    },
    session.accessToken
  );
  const body = (await res.json().catch(() => ({}))) as ChatMessageRow & { message?: string };
  if (!res.ok) throw new Error(body.message ?? "تعذر إرسال الرسالة");
  return body;
}

export async function uploadChatImage(roomId: string, uri: string, caption?: string): Promise<ChatMessageRow> {
  const session = await getDriverSession();
  if (!session) throw new Error("يجب تسجيل الدخول");
  const form = new FormData();
  const name = uri.split("/").pop() ?? "photo.jpg";
  form.append("image", { uri, name, type: "image/jpeg" } as unknown as Blob);
  if (caption?.trim()) form.append("caption", caption.trim());
  const res = await chatFetch(
    `/chat/rooms/${roomId}/images`,
    { method: "POST", body: form },
    session.accessToken
  );
  const body = (await res.json().catch(() => ({}))) as ChatMessageRow & { message?: string };
  if (!res.ok) throw new Error(body.message ?? "تعذر رفع الصورة");
  return body;
}

export async function uploadChatVoice(
  roomId: string,
  uri: string,
  durationMs: number
): Promise<ChatMessageRow> {
  const session = await getDriverSession();
  if (!session) throw new Error("يجب تسجيل الدخول");
  const form = new FormData();
  const name = uri.split("/").pop() ?? "voice.m4a";
  form.append("voice", { uri, name, type: "audio/m4a" } as unknown as Blob);
  form.append("durationMs", String(Math.round(durationMs)));
  const res = await chatFetch(
    `/chat/rooms/${roomId}/voice`,
    { method: "POST", body: form },
    session.accessToken
  );
  const body = (await res.json().catch(() => ({}))) as ChatMessageRow & { message?: string };
  if (!res.ok) throw new Error(body.message ?? "تعذر إرسال الرسالة الصوتية");
  return body;
}

export async function getOrderChatRoom(orderId: string): Promise<ChatRoomRow> {
  const session = await getDriverSession();
  if (!session) throw new Error("يجب تسجيل الدخول");
  const res = await chatFetch(`/chat/orders/${orderId}/room`, {}, session.accessToken);
  const body = (await res.json().catch(() => ({}))) as ChatRoomRow & { message?: string };
  if (!res.ok) throw new Error(body.message ?? "تعذر فتح محادثة الطلب");
  return body;
}

export async function getChatAccessToken(): Promise<string | null> {
  const session = await getDriverSession();
  return session?.accessToken ?? null;
}

export async function markChatRoomReadOnServer(roomId: string): Promise<void> {
  const session = await getDriverSession();
  if (!session) return;
  await chatFetch(`/chat/rooms/${roomId}/read`, { method: "POST" }, session.accessToken);
}

export async function archiveChatRoom(roomId: string): Promise<void> {
  const session = await getDriverSession();
  if (!session) throw new Error("يجب تسجيل الدخول");
  const res = await chatFetch(`/chat/rooms/${roomId}/archive`, { method: "POST" }, session.accessToken);
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(body.message ?? "تعذر أرشفة المحادثة");
}
