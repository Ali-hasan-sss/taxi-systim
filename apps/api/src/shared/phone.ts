/** توحيد رقم الهاتف للتخزين والبحث (أرقام فقط). */
export function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidPhoneDigits(digits: string, minLen = 8, maxLen = 15): boolean {
  return digits.length >= minLen && digits.length <= maxLen;
}
