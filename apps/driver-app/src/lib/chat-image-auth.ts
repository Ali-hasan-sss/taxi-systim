import { resolveExpoApiBase } from "@taxi/expo-api-base";

/** يُعيد رابط الصورة على نفس قاعدة API الحالية (يتجاوز مضيفًا قديمًا من الخادم) */
export function normalizeChatImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  const base = resolveExpoApiBase();
  const raw = imageUrl.split("?")[0].split("/").pop();
  if (!raw) return null;
  const name = decodeURIComponent(raw);
  return `${base}/chat/images/${encodeURIComponent(name)}`;
}

function blobToDataUri(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export async function resolveAuthedChatImageUri(
  imageUrl: string,
  token: string
): Promise<string | null> {
  const remote = normalizeChatImageUrl(imageUrl) ?? imageUrl;
  try {
    const res = await fetch(remote, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return await blobToDataUri(await res.blob());
  } catch {
    return null;
  }
}

export function normalizeChatVoiceUrl(voiceUrl: string | null): string | null {
  if (!voiceUrl) return null;
  const base = resolveExpoApiBase();
  const raw = voiceUrl.split("?")[0].split("/").pop();
  if (!raw) return null;
  const name = decodeURIComponent(raw);
  return `${base}/chat/voice/${encodeURIComponent(name)}`;
}

export async function resolveAuthedChatVoiceUri(
  voiceUrl: string,
  token: string
): Promise<string | null> {
  const remote = normalizeChatVoiceUrl(voiceUrl) ?? voiceUrl;
  try {
    const res = await fetch(remote, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return await blobToDataUri(await res.blob());
  } catch {
    return null;
  }
}
