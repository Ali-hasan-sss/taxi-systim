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

/** رسالة عند تعذّر فتح أي تطبيق واتساب على جهاز المنسق. */
export const WHATSAPP_OPEN_FAILED_MESSAGE =
  "تعذّر فتح واتساب. تأكد من تثبيت واتساب أو واتساب بزنس على جهازك.";

/** رسالة عند عدم وجود رقم هاتف صالح. */
export const WHATSAPP_NO_PHONE_MESSAGE = "لا يوجد رقم هاتف صالح لإرسال الرسالة.";

export type WhatsAppOpenOptions = {
  /** يفتح واتساب أعمال أولًا ثم العادي */
  preferBusiness?: boolean;
};

function buildWhatsAppQuery(phone: string, text?: string): { n: string; query: string } | null {
  const n = waMePhonePart(phone);
  if (!n) return null;
  const query = text != null ? `phone=${n}&text=${encodeURIComponent(text)}` : `phone=${n}`;
  return { n, query };
}

function androidIntentUrl(query: string, packageName: string): string {
  return `intent://send?${query}#Intent;scheme=whatsapp;package=${packageName};end`;
}

function buildWhatsAppUrlSets(query: string, n: string, text?: string) {
  const encodedText = text != null ? encodeURIComponent(text) : "";
  const httpsUrls =
    text != null
      ? [`https://wa.me/${n}?text=${encodedText}`, `https://api.whatsapp.com/send?${query}`]
      : [`https://wa.me/${n}`, `https://api.whatsapp.com/send?${query}`];

  const businessUrls: string[] = [];
  const regularUrls: string[] = [];

  if (Platform.OS === "android") {
    businessUrls.push(androidIntentUrl(query, "com.whatsapp.w4b"), `whatsapp-business://send?${query}`);
    regularUrls.push(androidIntentUrl(query, "com.whatsapp"), `whatsapp://send?${query}`);
  } else {
    businessUrls.push(`whatsapp-business://send?${query}`);
    regularUrls.push(`whatsapp://send?${query}`);
  }

  return { businessUrls, regularUrls, httpsUrls };
}

/**
 * روابط محتملة لفتح واتساب مع نص جاهز.
 * preferBusiness: أعمال أولًا (intent / whatsapp-business) ثم العادي.
 */
export function buildWhatsAppOpenCandidates(
  phone: string | null | undefined,
  text: string,
  options?: WhatsAppOpenOptions
): string[] {
  const built = phone ? buildWhatsAppQuery(phone, text) : null;
  if (!built) return [];

  const { n, query } = built;
  const { businessUrls, regularUrls, httpsUrls } = buildWhatsAppUrlSets(query, n, text);

  if (options?.preferBusiness) {
    return [...businessUrls, ...regularUrls, ...httpsUrls];
  }

  return [...httpsUrls, ...businessUrls, ...regularUrls];
}

/** روابط محادثة واتساب بدون نص مُسبق. */
export function buildWhatsAppChatCandidates(
  phone: string | null | undefined,
  options?: WhatsAppOpenOptions
): string[] {
  const built = phone ? buildWhatsAppQuery(phone) : null;
  if (!built) return [];

  const { n, query } = built;
  const { businessUrls, regularUrls, httpsUrls } = buildWhatsAppUrlSets(query, n);

  if (options?.preferBusiness) {
    return [...businessUrls, ...regularUrls, ...httpsUrls];
  }

  return [...httpsUrls, ...regularUrls, ...businessUrls];
}

/**
 * يفتح واتساب (أعمال أولًا ثم عادي عند الطلب) مع نص جاهز.
 * يجرّب كل رابط بالترتيب دون الاعتماد على canOpenURL الذي يفشل أحيانًا على أندرويد.
 */
export async function openWhatsAppChatWithText(
  phone: string | null | undefined,
  text: string,
  options?: WhatsAppOpenOptions
): Promise<boolean> {
  const urls = buildWhatsAppOpenCandidates(phone, text, options);
  for (const url of urls) {
    if (await tryOpenUrl(url)) {
      return true;
    }
  }
  return false;
}

/** يفتح محادثة واتساب مع الزبون بدون نص مُسبق. */
export async function openWhatsAppChat(
  phone: string | null | undefined,
  options?: WhatsAppOpenOptions
): Promise<boolean> {
  const urls = buildWhatsAppChatCandidates(phone, options);
  for (const url of urls) {
    if (await tryOpenUrl(url)) {
      return true;
    }
  }
  return false;
}
