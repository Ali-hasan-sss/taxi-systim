import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { shouldLoadExpoPushModule } from "./environment";
import {
  configureForegroundNotificationHandler,
  ensureExpoPushRegistration,
  subscribeExpoPushTokenRefresh,
  type PushRegistrationDeps
} from "./register";

type ExpoPushBootstrapProps = PushRegistrationDeps & {
  /** إعداد مستمعي الإشعار (مثل التنقل والأصوات) — يُرجع دالة تنظيف */
  setupNotificationHandlers?: () => (() => void) | void;
};

/** يطلب الإذن ويسجّل الرمز بعد تسجيل الدخول — يعمل من أي شاشة (بما فيها location-access). */
export function ExpoPushBootstrap(props: ExpoPushBootstrapProps) {
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (!shouldLoadExpoPushModule()) return;

    let cancelled = false;
    let removeTokenListener: (() => void) | undefined;
    let removeHandlers: (() => void) | undefined;
    let appSub: ReturnType<typeof AppState.addEventListener> | undefined;

    void import("expo-notifications").then(() => {
      if (cancelled) return;

      configureForegroundNotificationHandler();

      const deps: PushRegistrationDeps = {
        getAccessToken: () => propsRef.current.getAccessToken(),
        registerToken: (accessToken, token) => propsRef.current.registerToken(accessToken, token),
        channelName: propsRef.current.channelName
      };

      void ensureExpoPushRegistration(deps);
      removeTokenListener = subscribeExpoPushTokenRefresh(deps);

      appSub = AppState.addEventListener("change", (state) => {
        if (state === "active") void ensureExpoPushRegistration(deps);
      });

      const setup = propsRef.current.setupNotificationHandlers;
      if (setup) {
        const cleanup = setup();
        if (typeof cleanup === "function") removeHandlers = cleanup;
      }
    });

    return () => {
      cancelled = true;
      removeTokenListener?.();
      removeHandlers?.();
      appSub?.remove();
    };
  }, []);

  return null;
}
