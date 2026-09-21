import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { getPushRegistrationEpoch } from "./bootstrap-state";
import { shouldLoadExpoPushModule } from "./environment";
import {
  configureForegroundNotificationHandler,
  ensureExpoPushRegistration,
  isPushRegistrationFailure,
  isTerminalPushRegistrationReason,
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

/** يطلب الإذن مرة واحدة ويسجّل الرمز بعد تسجيل الدخول. لا يعيد طلب الصلاحية بعد الرفض. */
export function ExpoPushBootstrap(props: ExpoPushBootstrapProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const registeredRef = useRef(false);
  const successEpochRef = useRef(-1);

  useEffect(() => {
    if (!shouldLoadExpoPushModule()) return;

    let cancelled = false;
    let inFlight = false;
    let stopRetrying = false;
    let removeTokenListener: (() => void) | undefined;
    let removeHandlers: (() => void) | undefined;
    let appSub: ReturnType<typeof AppState.addEventListener> | undefined;
    let retryTimer: ReturnType<typeof setInterval> | undefined;

    const deps = (): PushRegistrationDeps => ({
      getAccessToken: () => propsRef.current.getAccessToken(),
      registerToken: (accessToken, token) => propsRef.current.registerToken(accessToken, token),
      channelName: propsRef.current.channelName
    });

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = undefined;
      }
    };

    const attemptRegistration = async (opts?: { prompt?: boolean }) => {
      if (cancelled || inFlight) return;
      const epoch = getPushRegistrationEpoch();
      if (registeredRef.current && successEpochRef.current === epoch) return;
      inFlight = true;
      try {
        const result = await ensureExpoPushRegistration(deps(), { prompt: opts?.prompt === true });
        if (cancelled) return;
        logPushRegistrationResult(result);
        if (result.ok) {
          registeredRef.current = true;
          successEpochRef.current = epoch;
          stopRetrying = false;
          clearRetryTimer();
          return;
        }
        registeredRef.current = false;
        if (isPushRegistrationFailure(result) && isTerminalPushRegistrationReason(result.reason)) {
          stopRetrying = true;
          clearRetryTimer();
        }
      } finally {
        inFlight = false;
      }
    };

    void (async () => {
      configureForegroundNotificationHandler();

      void attemptRegistration({ prompt: true });
      removeTokenListener = subscribeExpoPushTokenRefresh(deps());

      appSub = AppState.addEventListener("change", (state) => {
        if (state !== "active") return;
        // بعد العودة من إعدادات الجهاز: نتحقق بدون إعادة طلب الحوار.
        void attemptRegistration({ prompt: false });
      });

      retryTimer = setInterval(() => {
        if (stopRetrying) {
          clearRetryTimer();
          return;
        }
        void attemptRegistration({ prompt: false });
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
      clearRetryTimer();
    };
  }, []);

  return null;
}
