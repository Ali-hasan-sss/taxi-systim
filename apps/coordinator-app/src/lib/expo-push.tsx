import { ensureExpoPushRegistration, ExpoPushBootstrap, shouldLoadExpoPushModule } from "@taxi/expo-push";
import { useCallback } from "react";
import { clearExpoPushToken, registerExpoPushToken } from "./api";
import { setupCoordinatorOrderPushHandlers } from "./push-order-notifications";
import { getSession } from "./session";

export function CoordinatorPushBootstrap() {
  const getAccessToken = useCallback(async () => (await getSession())?.accessToken, []);
  const registerToken = useCallback(
    (accessToken: string, token: string) => registerExpoPushToken(accessToken, token),
    []
  );
  const setupHandlers = useCallback(() => setupCoordinatorOrderPushHandlers(), []);

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

export async function unregisterCoordinatorPushOnServer(): Promise<void> {
  const session = await getSession();
  if (!session?.accessToken) return;
  try {
    await clearExpoPushToken(session.accessToken);
  } catch {
    /* تجاهل */
  }
}

export { ensureExpoPushRegistration, shouldLoadExpoPushModule } from "@taxi/expo-push";

export async function ensurePushRegistrationForCoordinator(): Promise<void> {
  await ensureExpoPushRegistration({
    getAccessToken: async () => (await getSession())?.accessToken,
    registerToken: registerExpoPushToken,
    channelName: "الطلبات"
  });
}
