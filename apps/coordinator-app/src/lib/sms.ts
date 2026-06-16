import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { normalizeSyriaPhoneForWaMe } from "./whatsapp";

/** رقم سوري → صيغة محلية للرسائل: 0994488858 */
export function normalizeSyriaPhoneForSms(phone: string | null | undefined): string | null {
  const e164 = normalizeSyriaPhoneForWaMe(phone);
  if (!e164) return null;
  if (e164.startsWith("963") && e164.length >= 11) {
    return `0${e164.slice(3)}`;
  }
  return e164;
}

function buildSmsUrl(phone: string, body: string): string {
  const encoded = encodeURIComponent(body);
  const separator = Platform.OS === "ios" ? "&" : "?";
  return `sms:${phone}${separator}body=${encoded}`;
}

/**
 * يفتح تطبيق الرسائل مع رقم الزبون ونص الفاتورة جاهزًا للإرسال.
 */
export async function openSmsWithText(
  phone: string | null | undefined,
  text: string
): Promise<boolean> {
  const local = normalizeSyriaPhoneForSms(phone);
  if (!local) return false;

  const intl = normalizeSyriaPhoneForWaMe(phone);
  const candidates = [
    buildSmsUrl(local, text),
    `smsto:${local}?body=${encodeURIComponent(text)}`,
    ...(intl && intl !== local ? [buildSmsUrl(intl, text), `smsto:${intl}?body=${encodeURIComponent(text)}`] : [])
  ];

  for (const url of candidates) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // جرّب الصيغة التالية
    }
  }
  return false;
}
