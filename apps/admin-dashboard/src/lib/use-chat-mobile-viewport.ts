import { useEffect } from "react";

const MOBILE_CHAT_MQ = "(max-width: 900px)";

/** يضبط ارتفاع المحادثة ويُمرّر للأسفل عند فتح لوحة مفاتيح الموبايل */
export function useChatMobileViewport(
  layoutRef: React.RefObject<HTMLElement | null>,
  scrollToBottom: (instant?: boolean) => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;
    const layout = layoutRef.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!layout || !vv) return;

    const apply = () => {
      const isMobile = window.matchMedia(MOBILE_CHAT_MQ).matches;
      if (!isMobile) {
        layout.style.removeProperty("height");
        layout.style.removeProperty("--chat-kb-inset");
        return;
      }

      const top = layout.getBoundingClientRect().top;
      const height = Math.max(vv.height - top, 180);
      layout.style.height = `${height}px`;
      const kbInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      layout.style.setProperty("--chat-kb-inset", `${kbInset}px`);
      scrollToBottom(true);
    };

    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    apply();

    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      layout.style.removeProperty("height");
      layout.style.removeProperty("--chat-kb-inset");
    };
  }, [enabled, layoutRef, scrollToBottom]);
}
