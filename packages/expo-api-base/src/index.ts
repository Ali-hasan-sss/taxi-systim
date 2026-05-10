import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * المنفذ الافتراضي لـ API في التطوير المحلي (انظر API_PORT في apps/api).
 * للمحاكي Android بدون إعداد: غالبًا http://10.0.2.2:4000/api
 * للجهاز الحقيقي مع Expo Go: يُشتق IP الحاسوب من خادم التطوير تلقائيًا عندما يكون __DEV__ === true.
 * في الإنتاج / بناء الإصدار (!__DEV__): إذا لم يُمرَّر EXPO_PUBLIC_API_URL، نستخدم https://taxi.qmenussy.com/api.
 */
const API_PORT = 4000;
const PROD_API_BASE = "https://taxi.qmenussy.com/api";

function stripTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

function devMachineHostFromExpo(): string | null {
  const uri = Constants.expoConfig?.hostUri;
  if (!uri) return null;
  const host = uri.split(":")[0]?.trim();
  return host || null;
}

function isLoopbackApiUrl(url: string): boolean {
  try {
    const normalized = url.includes("://") ? url : `http://${url}`;
    const u = new URL(normalized);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
  } catch {
    return false;
  }
}

/** قاعدة REST للـ API — نفس المنطق في تطبيق المنسق وتطبيق السائق. */
export function resolveExpoApiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (env && !isLoopbackApiUrl(env)) {
    return stripTrailingSlashes(env);
  }

  if (__DEV__) {
    const host = devMachineHostFromExpo();
    if (host) {
      return stripTrailingSlashes(`http://${host}:${API_PORT}/api`);
    }
    if (Platform.OS === "android") {
      return stripTrailingSlashes(`http://10.0.2.2:${API_PORT}/api`);
    }
    return stripTrailingSlashes(`http://localhost:${API_PORT}/api`);
  }

  if (!__DEV__) {
    return stripTrailingSlashes(PROD_API_BASE);
  }
  return stripTrailingSlashes(`http://localhost:${API_PORT}/api`);
}

/** أصل WebSocket (بدون مسار /api) من قاعدة الـ API */
export function getSocketOriginFromApiBase(apiBase: string): string {
  return stripTrailingSlashes(apiBase.replace(/\/api$/i, ""));
}
