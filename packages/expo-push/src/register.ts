import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

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
  return legacy && legacy.length > 8 ? legacy : undefined;
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

/** تسجيل صلاحية الإشعار وإرسال رمز Expo إلى الخادم. */
export async function ensureExpoPushRegistration(deps: PushRegistrationDeps): Promise<PushRegistrationResult> {
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
    return { ok: false, reason: "no_project_id", message: "missing EAS projectId in app.json extra.eas" };
  }

  try {
    const { data: expoToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!expoToken) return { ok: false, reason: "no_token" };
    await deps.registerToken(accessToken, expoToken);
    if (__DEV__) console.info("[expo-push] registered", expoToken.slice(0, 24) + "…");
    return { ok: true, token: expoToken };
  } catch (e) {
    const message = e instanceof Error ? e.message : "registration failed";
    if (__DEV__) console.warn("[expo-push] registration failed", message);
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
