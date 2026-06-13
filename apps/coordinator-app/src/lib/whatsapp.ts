import { Platform } from "react-native";
import * as Linking from "expo-linking";

/** عربي/فارسي → أرقام غربية ثم إبقاء الأرقام فقط. */
function extractWesternDigitRun(phone: string): string {
  const western = phone
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
  return western.replace(/[^\d]/g, "");
}

/**
 * رقم سوري → صيغة wa.me (بدون +): 963XXXXXXXXX
 * - 0994488858 → 963994488858
 * - +963994488858 / 963994488858 / 009639944888588 → دون مضاعفة 963
 */
export function normalizeSyriaPhoneForWaMe(phone: string | null | undefined): string | null {
  if (phone == null) return null;
  const raw = String(phone).trim();
  if (!raw) return null;
  let d = extractWesternDigitRun(raw);
  if (d.length < 8) return null;

  if (d.startsWith("00")) d = d.slice(2);

  if (d.startsWith("963")) {
    return d.length >= 11 && d.length <= 15 ? d : null;
  }

  if (d.startsWith("0") && d.length >= 9) {
    return `963${d.slice(1)}`;
  }

  if (d.startsWith("9") && d.length === 9) {
    return `963${d}`;
  }

  if (d.length >= 8 && d.length <= 10) {
    return `963${d}`;
  }

  return null;
}

/** عرض للواجهة: +963994488858 */
export function formatSyrianPhoneForDisplay(phone: string | null | undefined): string {
  const n = normalizeSyriaPhoneForWaMe(phone);
  if (n) return `+${n}`;
  const s = phone != null ? String(phone).trim() : "";
  return s;
}

function waMePhonePart(phone: string | null | undefined): string | null {
  return normalizeSyriaPhoneForWaMe(phone);
}

/** رابط محادثة واتساب برقم سوري شائع التنسيق (09… أو 963…). */
export function buildWhatsAppChatUrl(phone: string | null | undefined): string | null {
  const n = waMePhonePart(phone);
  if (!n) return null;
  return `https://wa.me/${n}`;
}

/** رابط واتساب مع نص مُهيأ مسبقًا في حقل الرسالة. */
export function buildWhatsAppChatUrlWithText(phone: string | null | undefined, text: string): string | null {
  const n = waMePhonePart(phone);
  if (!n) return null;
  const q = new URLSearchParams({ text });
  return `https://wa.me/${n}?${q.toString()}`;
}

async function tryOpenUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * روابط محتملة لفتح واتساب (عادي أو أعمال) مع نص جاهز.
 * الروابط https أولًا لأنها الأكثر موثوقية، ثم intent لأندرويد، ثم مخططات التطبيق.
 */
export function buildWhatsAppOpenCandidates(phone: string | null | undefined, text: string): string[] {
  const n = waMePhonePart(phone);
  if (!n) return [];

  const encodedText = encodeURIComponent(text);
  const query = `phone=${n}&text=${encodedText}`;

  const urls: string[] = [
    `https://wa.me/${n}?text=${encodedText}`,
    `https://api.whatsapp.com/send?${query}`
  ];

  if (Platform.OS === "android") {
    urls.push(
      `intent://send?${query}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`,
      `intent://send?${query}#Intent;scheme=whatsapp;package=com.whatsapp;end`
    );
  }

  urls.push(`whatsapp://send?${query}`, `whatsapp-business://send?${query}`);

  return urls;
}

/**
 * يفتح واتساب (عادي أو أعمال) مع نص جاهز.
 * يجرّب كل رابط بالترتيب دون الاعتماد على canOpenURL الذي يفشل أحيانًا مع واتساب أعمال على أندرويد.
 */
export async function openWhatsAppChatWithText(
  phone: string | null | undefined,
  text: string
): Promise<boolean> {
  const urls = buildWhatsAppOpenCandidates(phone, text);
  for (const url of urls) {
    if (await tryOpenUrl(url)) {
      return true;
    }
  }
  return false;
}
