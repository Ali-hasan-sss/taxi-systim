/** توقيت سوريا (دمشق) — يطابق التقويم الميلادي المحلي عند منتصف الليل. */
export const SYRIA_TIME_ZONE = "Asia/Damascus";

/** تاريخ اليوم الحالي بتوقيت سوريا بصيغة YYYY-MM-DD (للعرض أو للمقارنة). */
export function syriaCalendarDayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SYRIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}
