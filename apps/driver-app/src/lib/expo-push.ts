import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { clearExpoPushToken, registerExpoPushToken } from "./api";
import { getDriverSession } from "./session";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

function resolveExpoProjectId(): string | undefined {
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (fromExtra && fromExtra.length > 8 && !fromExtra.includes("NEED")) return fromExtra;
  const legacy = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return legacy && legacy.length > 8 ? legacy : undefined;
}

/** تسجيل صلاحية الإشعار وإرسال رمز Expo إلى الخادم (بعد تسجيل الدخول). */
export async function ensurePushRegistrationForDriver(): Promise<void> {
  const session = await getDriverSession();
  if (!session?.accessToken) return;
  if (!Device.isDevice) return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let next = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    next = status;
  }
  if (next !== "granted") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "الطلبات",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default"
    });
  }

  const projectId = resolveExpoProjectId();
  const opts = projectId ? { projectId } : {};
  const { data: expoToken } = await Notifications.getExpoPushTokenAsync(opts);
  if (!expoToken) return;
  await registerExpoPushToken(session.accessToken, expoToken);
}

export function subscribeDriverPushTokenRefresh(): () => void {
  const sub = Notifications.addPushTokenListener((ev) => {
    const token = typeof ev.data === "string" ? ev.data : "";
    if (!token) return;
    void (async () => {
      const session = await getDriverSession();
      if (!session?.accessToken) return;
      try {
        await registerExpoPushToken(session.accessToken, token);
      } catch {
        /* تجاهل */
      }
    })();
  });
  return () => sub.remove();
}

export async function unregisterDriverPushOnServer(): Promise<void> {
  const session = await getDriverSession();
  if (!session?.accessToken) return;
  try {
    await clearExpoPushToken(session.accessToken);
  } catch {
    /* تجاهل — المستخدم يخرج في كل الأحوال */
  }
}
