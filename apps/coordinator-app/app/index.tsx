import { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { Redirect } from "expo-router";
import { getSession } from "../src/lib/session";

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Index() {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await getSession();
        if (alive) setLoggedIn(!!s?.accessToken);
      } catch {
        if (alive) setLoggedIn(false);
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

  if (loggedIn) return <Redirect href="/(tabs)" />;
  return <Redirect href="/login" />;
}
