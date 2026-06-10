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

/** روابط محتملة: واتساب أعمال ثم واتساب عادي ثم الروابط الرسمية. */
export function buildWhatsAppOpenCandidates(phone: string | null | undefined, text: string): string[] {
  const n = waMePhonePart(phone);
  if (!n) return [];
  const q = encodeURIComponent(text);
  return [
    `whatsapp-business://send?phone=${n}&text=${q}`,
    `whatsapp://send?phone=${n}&text=${q}`,
    `https://api.whatsapp.com/send?phone=${n}&text=${q}`,
    `https://wa.me/${n}?text=${q}`
  ];
}

/**
 * يفتح واتساب (عادي أو أعمال) مع نص جاهز.
 * يجرّب مخططات التطبيق أولًا ثم الروابط https.
 */
export async function openWhatsAppChatWithText(
  phone: string | null | undefined,
  text: string
): Promise<boolean> {
  const urls = buildWhatsAppOpenCandidates(phone, text);
  for (const url of urls) {
    try {
      if (url.startsWith("http")) {
        await Linking.openURL(url);
        return true;
      }
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      /* جرّب الرابط التالي */
    }
  }
  const fallback = urls[urls.length - 1];
  if (fallback) {
    try {
      await Linking.openURL(fallback);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
