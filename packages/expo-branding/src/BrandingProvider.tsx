import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState, type ImageSourcePropType } from "react-native";
import { fetchPublicBranding, readCachedBrandingUris, syncBrandingCache, type BrandingKind } from "./cache";

let cacheReadySettled = false;
let markCacheReady: () => void = () => {};

/** يكتمل بعد قراءة الهوية المحفوظة محليًا أو أول مزامنة مع الخادم. */
export const brandingCacheReady: Promise<void> = new Promise((resolve) => {
  markCacheReady = () => {
    if (cacheReadySettled) return;
    cacheReadySettled = true;
    resolve();
  };
});

type BrandingContextValue = {
  ready: boolean;
  appName: string;
  logoSource: ImageSourcePropType | null;
  backgroundSource: ImageSourcePropType;
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function useBranding(): BrandingContextValue {
  const value = useContext(BrandingContext);
  if (!value) {
    throw new Error("useBranding must be used within BrandingProvider");
  }
  return value;
}

export function BrandingProvider({
  kind,
  apiBase,
  fallbackLogo,
  fallbackBackground,
  children
}: {
  kind: BrandingKind;
  apiBase: string;
  fallbackLogo: ImageSourcePropType;
  fallbackBackground: ImageSourcePropType;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [appName, setAppName] = useState("");
  const [logoSource, setLogoSource] = useState<ImageSourcePropType | null>(null);
  const [backgroundSource, setBackgroundSource] = useState<ImageSourcePropType>(fallbackBackground);

  useEffect(() => {
    if (ready) markCacheReady();
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let rerun = false;

    const finishReady = () => {
      if (!cancelled) setReady(true);
    };

    const applyLocal = async () => {
      try {
        const cached = await readCachedBrandingUris(kind);
        if (cancelled) return false;
        if (cached.logo) setLogoSource({ uri: cached.logo });
        if (cached.background) setBackgroundSource({ uri: cached.background });
        setAppName(cached.appName);
        return Boolean(cached.logo || cached.background || cached.appName);
      } catch {
        return false;
      }
    };

    const pullRemote = async () => {
      const remote = await fetchPublicBranding(apiBase);
      if (!remote || cancelled) return false;
      const next = await syncBrandingCache(kind, remote);
      if (cancelled) return false;
      setAppName(next.appName);
      setLogoSource(next.logo ? { uri: next.logo } : fallbackLogo);
      setBackgroundSource(next.background ? { uri: next.background } : fallbackBackground);
      return true;
    };

    const run = async () => {
      if (running) {
        rerun = true;
        return;
      }
      running = true;
      try {
        do {
          rerun = false;
          const hadCache = await applyLocal();
          if (hadCache) finishReady();
          try {
            const remoteOk = await pullRemote();
            if (!remoteOk && !hadCache) {
              setLogoSource(fallbackLogo);
              setBackgroundSource(fallbackBackground);
            }
          } catch {
            if (!hadCache) {
              setLogoSource(fallbackLogo);
              setBackgroundSource(fallbackBackground);
            }
          }
          finishReady();
        } while (rerun && !cancelled);
      } finally {
        running = false;
      }
    };

    void run();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void run();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [apiBase, fallbackBackground, fallbackLogo, kind]);

  return (
    <BrandingContext.Provider value={{ ready, appName, logoSource, backgroundSource }}>
      {children}
    </BrandingContext.Provider>
  );
}
