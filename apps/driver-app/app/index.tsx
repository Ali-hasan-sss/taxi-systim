import { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { Redirect, type Href } from "expo-router";
import { getDriverLocationAccessState, isDriverLocationReady } from "../src/lib/location-access";
import { ensurePushRegistrationForDriver } from "../src/lib/expo-push";
import { getDriverSession } from "../src/lib/session";
import { useDriverStore } from "../src/store";

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Index() {
  const [ready, setReady] = useState(false);
  const [target, setTarget] = useState<Href | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await getDriverSession();
        if (!alive) return;
        if (!s?.accessToken) {
          useDriverStore.getState().setOnline(false);
          setTarget("/login");
          return;
        }

        void ensurePushRegistrationForDriver(s.accessToken);

        const locationState = await getDriverLocationAccessState();
        if (!alive) return;

        if (isDriverLocationReady(locationState)) {
          useDriverStore.getState().setOnline(true);
          setTarget("/(tabs)");
        } else {
          useDriverStore.getState().setOnline(false);
          setTarget("/location-access");
        }
      } catch {
        if (alive) {
          useDriverStore.getState().setOnline(false);
          setTarget("/login");
        }
      } finally {
        if (alive) {
          await SplashScreen.hideAsync().catch(() => {});
          setReady(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) {
    return null;
  }

  if (!target) {
    return null;
  }

  return <Redirect href={target} />;
}
