import { ensureExpoPushRegistration, ExpoPushBootstrap, shouldLoadExpoPushModule } from "@taxi/expo-push";
import { useCallback } from "react";
import { clearExpoPushToken, registerExpoPushToken } from "./api";
import { setupDriverOrderPushHandlers } from "./push-order-notifications";
import { getDriverSession } from "./session";

export function DriverPushBootstrap() {
  const getAccessToken = useCallback(async () => (await getDriverSession())?.accessToken, []);
  const registerToken = useCallback(
    (accessToken: string, token: string) => registerExpoPushToken(accessToken, token),
    []
  );
  const setupHandlers = useCallback(() => setupDriverOrderPushHandlers(), []);

  if (!shouldLoadExpoPushModule()) return null;

  return (
    <ExpoPushBootstrap
      getAccessToken={getAccessToken}
      registerToken={registerToken}
      channelName="الطلبات"
      setupNotificationHandlers={setupHandlers}
    />
  );
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

export { ensureExpoPushRegistration, shouldLoadExpoPushModule } from "@taxi/expo-push";

export async function ensurePushRegistrationForDriver(): Promise<void> {
  await ensureExpoPushRegistration({
    getAccessToken: async () => (await getDriverSession())?.accessToken,
    registerToken: registerExpoPushToken,
    channelName: "الطلبات"
  });
}
