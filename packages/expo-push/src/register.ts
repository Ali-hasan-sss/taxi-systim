import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const LOG = "[expo-push]";

export type PushRegistrationResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: "no_session" | "simulator" | "permission_denied" | "no_project_id" | "no_token" | "server_error";
      message?: string;
    };

export type PushRegistrationDeps = {
  getAccessToken: () => Promise<string | null | undefined>;
  registerToken: (accessToken: string, expoToken: string) => Promise<void>;
  channelName?: string;
};

function resolveExpoProjectId(): string | undefined {
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (fromExtra && fromExtra.length > 8 && !fromExtra.includes("NEED")) return fromExtra;
  const legacy = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (legacy && legacy.length > 8) return legacy;
  const manifest2 = Constants.manifest2 as { extra?: { expoClient?: { extra?: { eas?: { projectId?: string } } } } } | null;
  const fromManifest2 = manifest2?.extra?.expoClient?.extra?.eas?.projectId;
  if (fromManifest2 && fromManifest2.length > 8) return fromManifest2;
  return undefined;
}

/** يُستدعى مرة عند بدء التطبيق — إظهار الإشعار في المقدمة. */
export function configureForegroundNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true
    })
  });
}

/** طلب POST_NOTIFICATIONS (Android 13+) وصلاحيات iOS. */
export async function requestNotificationPermission(): Promise<"granted" | "denied"> {
  if (!Device.isDevice) return "denied";

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return "granted";

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true
    }
  });

  return requested.granted ? "granted" : "denied";
}

export async function ensureAndroidNotificationChannel(
  channelId = "default",
  channelName = "الإشعارات"
): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(channelId, {
    name: channelName,
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: "default",
    enableVibrate: true
  });
}

export type PushRegistrationFailure = Extract<PushRegistrationResult, { ok: false }>;

export function isPushRegistrationFailure(result: PushRegistrationResult): result is PushRegistrationFailure {
  return result.ok === false;
}

export function logPushRegistrationResult(result: PushRegistrationResult): void {
  if (isPushRegistrationFailure(result)) {
    console.warn(`${LOG} not registered:`, result.reason, result.message ?? "");
    return;
  }
  console.info(`${LOG} registered on server`, result.token.slice(0, 24) + "…");
}

/** إعادة المحاولة بعد تسجيل الدخول — FCM قد لا يكون جاهزًا فورًا. */
export async function retryExpoPushRegistration(
  deps: PushRegistrationDeps,
  options?: { attempts?: number; delayMs?: number }
): Promise<PushRegistrationResult> {
  const attempts = options?.attempts ?? 10;
  const delayMs = options?.delayMs ?? 3000;
  let last: PushRegistrationResult = { ok: false, reason: "no_session" };

  for (let i = 0; i < attempts; i++) {
    const outcome = await ensureExpoPushRegistration(deps);
    last = outcome;
    logPushRegistrationResult(outcome);
    if (outcome.ok) return outcome;
    if (isPushRegistrationFailure(outcome)) {
      if (outcome.reason === "simulator" || outcome.reason === "permission_denied") return outcome;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}

/** تسجيل صلاحية الإشعار وإرسال رمز Expo إلى الخادم. */
export async function ensureExpoPushRegistration(deps: PushRegistrationDeps): Promise<PushRegistrationResult> {
  if (Constants.appOwnership === "expo" && Platform.OS === "android") {
    return {
      ok: false,
      reason: "server_error",
      message: "Expo Go على أندرويد لا يدعم Push — ثبّت APK من EAS"
    };
  }

  const accessToken = await deps.getAccessToken();
  if (!accessToken) return { ok: false, reason: "no_session" };
  if (!Device.isDevice) return { ok: false, reason: "simulator" };

  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "permission_denied", message: "لم يُمنح إذن الإشعارات" };
  }

  await ensureAndroidNotificationChannel("default", deps.channelName ?? "الإشعارات");

  const projectId = resolveExpoProjectId();
  if (!projectId) {
    return {
      ok: false,
      reason: "no_project_id",
      message: "missing EAS projectId — تحقق من app.json extra.eas.projectId"
    };
  }

  let expoToken: string;
  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    expoToken = tokenResult.data ?? "";
    if (!expoToken) return { ok: false, reason: "no_token", message: "getExpoPushTokenAsync returned empty" };
    console.info(`${LOG} device token obtained`, expoToken.slice(0, 24) + "…");
  } catch (e) {
    const message = e instanceof Error ? e.message : "getExpoPushTokenAsync failed";
    console.warn(`${LOG} FCM/token error:`, message);
    const needsGoogleServices =
      /FirebaseApp is not initialized|google-services/i.test(message);
    return {
      ok: false,
      reason: "no_token",
      message: needsGoogleServices
        ? `${message} — أضف google-services.json من Firebase إلى مجلد التطبيق (انظر docs/PUSH-SETUP-AR.md) ثم أعد بناء EAS`
        : `${message} — تحقق من FCM V1 و google-services.json و SHA-1 في Firebase`
    };
  }

  try {
    console.info(`${LOG} POST /auth/push-token…`);
    await deps.registerToken(accessToken, expoToken);
    return { ok: true, token: expoToken };
  } catch (e) {
    const message = e instanceof Error ? e.message : "API registration failed";
    console.warn(`${LOG} API error:`, message);
    return { ok: false, reason: "server_error", message };
  }
}

export function subscribeExpoPushTokenRefresh(deps: PushRegistrationDeps): () => void {
  const sub = Notifications.addPushTokenListener((ev) => {
    const token = typeof ev.data === "string" ? ev.data : "";
    if (!token) return;
    void (async () => {
      const accessToken = await deps.getAccessToken();
      if (!accessToken) return;
      try {
        await deps.registerToken(accessToken, token);
        if (__DEV__) console.info("[expo-push] token refreshed");
      } catch {
        /* تجاهل */
      }
    })();
  });
  return () => sub.remove();
}
