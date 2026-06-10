import { useEffect, useState } from "react";

/** تأخير بسيط بعد توقف الكتابة قبل إرسال طلب البحث */
export const SEARCH_DEBOUNCE_MS = 500;

export function useDebouncedValue<T>(value: T, delayMs = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function useDebouncedSearch(draft: string, delayMs = SEARCH_DEBOUNCE_MS) {
  const query = useDebouncedValue(draft.trim(), delayMs);
  const isPending = draft.trim() !== query;
  return { query, isPending };
}
