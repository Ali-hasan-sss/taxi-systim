import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { getPushRegistrationEpoch } from "./bootstrap-state";
import { shouldLoadExpoPushModule } from "./environment";
import {
  configureForegroundNotificationHandler,
  ensureExpoPushRegistration,
  logPushRegistrationResult,
  subscribeExpoPushTokenRefresh,
  type PushRegistrationDeps
} from "./register";

export { resetPushRegistrationState } from "./bootstrap-state";

const RETRY_MS = 4000;

type ExpoPushBootstrapProps = PushRegistrationDeps & {
  /** إعداد مستمعي الإشعار (مثل التنقل والأصوات) — يُرجع دالة تنظيف */
  setupNotificationHandlers?: () => (() => void) | void;
};

/** يطلب الإذن ويسجّل الرمز بعد تسجيل الدخول — يعيد المحاولة حتى ينجح أو انتهاء المهلة. */
export function ExpoPushBootstrap(props: ExpoPushBootstrapProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const registeredRef = useRef(false);
  const successEpochRef = useRef(-1);

  useEffect(() => {
    if (!shouldLoadExpoPushModule()) return;

    let cancelled = false;
    let removeTokenListener: (() => void) | undefined;
    let removeHandlers: (() => void) | undefined;
    let appSub: ReturnType<typeof AppState.addEventListener> | undefined;
    let retryTimer: ReturnType<typeof setInterval> | undefined;

    const deps = (): PushRegistrationDeps => ({
      getAccessToken: () => propsRef.current.getAccessToken(),
      registerToken: (accessToken, token) => propsRef.current.registerToken(accessToken, token),
      channelName: propsRef.current.channelName
    });

    const attemptRegistration = async () => {
      if (cancelled) return;
      const epoch = getPushRegistrationEpoch();
      if (registeredRef.current && successEpochRef.current === epoch) return;
      const result = await ensureExpoPushRegistration(deps());
      logPushRegistrationResult(result);
      if (result.ok) {
        registeredRef.current = true;
        successEpochRef.current = epoch;
      } else {
        registeredRef.current = false;
      }
    };

    void (async () => {
      configureForegroundNotificationHandler();

      void attemptRegistration();
      removeTokenListener = subscribeExpoPushTokenRefresh(deps());

      appSub = AppState.addEventListener("change", (state) => {
        if (state === "active") void attemptRegistration();
      });

      retryTimer = setInterval(() => {
        void attemptRegistration();
      }, RETRY_MS);

      const setup = propsRef.current.setupNotificationHandlers;
      if (setup) {
        const cleanup = setup();
        if (typeof cleanup === "function") removeHandlers = cleanup;
      }
    })();

    return () => {
      cancelled = true;
      removeTokenListener?.();
      removeHandlers?.();
      appSub?.remove();
      if (retryTimer) clearInterval(retryTimer);
    };
  }, []);

  return null;
}
