import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Modal, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "./ThemeProvider";
import { rtlText } from "./rtl";

type AppKind = "driver" | "coordinator";

type AppVersionPolicy = {
  minVersion: string;
  androidUrl: string;
  iosUrl: string;
};

function parseVersionParts(value: string): number[] {
  return value.split(/[.+-]/).map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

export function isAppVersionBelowMin(currentVersion: string, minVersion: string): boolean {
  const min = minVersion.trim();
  if (!min || min === "0.0.0") return false;
  const current = parseVersionParts(currentVersion.trim() || "0.0.0");
  const required = parseVersionParts(min);
  const len = Math.max(current.length, required.length);
  for (let i = 0; i < len; i++) {
    const diff = (current[i] ?? 0) - (required[i] ?? 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
}

function pickStoreUrl(policy: AppVersionPolicy): string {
  if (Platform.OS === "ios") {
    return policy.iosUrl.trim() || policy.androidUrl.trim();
  }
  return policy.androidUrl.trim() || policy.iosUrl.trim();
}

async function fetchAppPolicy(apiBase: string, app: AppKind): Promise<AppVersionPolicy | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${apiBase.replace(/\/+$/, "")}/public/app-config`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<Record<AppKind, AppVersionPolicy>>;
    const policy = json[app];
    if (!policy || typeof policy.minVersion !== "string") return null;
    return {
      minVersion: policy.minVersion,
      androidUrl: typeof policy.androidUrl === "string" ? policy.androidUrl : "",
      iosUrl: typeof policy.iosUrl === "string" ? policy.iosUrl : ""
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** شاشة إيقاف كاملة إذا كانت نسخة التطبيق أقل من الحد الأدنى المعتمد من الإدارة */
export function ForceUpdateGate({
  apiBase,
  app,
  currentVersion
}: {
  apiBase: string;
  app: AppKind;
  currentVersion: string;
}) {
  const { theme } = useTheme();
  const [blocked, setBlocked] = useState(false);
  const [requiredVersion, setRequiredVersion] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [opening, setOpening] = useState(false);

  const styles = useThemedStyles((t) => ({
    overlay: {
      flex: 1,
      backgroundColor: t.colors.background,
      paddingHorizontal: 20,
      justifyContent: "center" as const,
      direction: "rtl" as const
    },
    card: {
      backgroundColor: t.colors.surfaceGlass,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: 22
    },
    iconWrap: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: t.colors.warningBg,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      alignSelf: "center" as const,
      marginBottom: 14
    },
    title: {
      fontSize: 24,
      fontWeight: "800" as const,
      color: t.colors.text,
      ...rtlText,
      textAlign: "right" as const
    },
    subtitle: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 24,
      color: t.colors.textMuted,
      ...rtlText,
      textAlign: "right" as const
    },
    versions: {
      marginTop: 16,
      backgroundColor: t.colors.surfaceInset,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 16,
      padding: 14,
      gap: 8
    },
    versionRow: {
      flexDirection: "row-reverse" as const,
      justifyContent: "space-between" as const,
      gap: 12
    },
    versionLabel: {
      color: t.colors.textSubtle,
      fontSize: 13,
      fontWeight: "700" as const,
      ...rtlText
    },
    versionValue: {
      color: t.colors.text,
      fontSize: 13,
      fontWeight: "800" as const
    },
    primaryBtn: {
      marginTop: 18,
      backgroundColor: t.colors.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: "center" as const
    },
    primaryBtnText: {
      color: t.colors.textInverse,
      fontSize: 15,
      fontWeight: "800" as const,
      ...rtlText
    },
    hint: {
      marginTop: 14,
      color: t.colors.textSubtle,
      fontSize: 13,
      lineHeight: 22,
      ...rtlText,
      textAlign: "right" as const
    }
  }));

  const check = useCallback(async () => {
    const policy = await fetchAppPolicy(apiBase, app);
    if (!policy) return;
    const outdated = isAppVersionBelowMin(currentVersion, policy.minVersion);
    setRequiredVersion(policy.minVersion);
    setStoreUrl(pickStoreUrl(policy));
    setBlocked(outdated);
  }, [apiBase, app, currentVersion]);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener("change", (status) => {
      if (status === "active") void check();
    });
    return () => sub.remove();
  }, [check]);

  const openStore = async () => {
    if (!storeUrl || opening) return;
    setOpening(true);
    try {
      await Linking.openURL(storeUrl);
    } catch {
      // يبقى المستخدم على شاشة الإيقاف
    } finally {
      setOpening(false);
    }
  };

  if (!blocked) return null;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={() => undefined}>
      <SafeAreaView style={styles.overlay} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-download-outline" size={34} color={theme.colors.warning} />
          </View>
          <Text style={styles.title}>يجب تحديث التطبيق</Text>
          <Text style={styles.subtitle}>
            هذه النسخة لم تعد مدعومة. حدّث إلى أحدث نسخة لمتابعة استخدام التطبيق.
          </Text>
          <View style={styles.versions}>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>نسختك الحالية</Text>
              <Text style={styles.versionValue}>{currentVersion || "—"}</Text>
            </View>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>النسخة المطلوبة</Text>
              <Text style={styles.versionValue}>{requiredVersion || "—"}</Text>
            </View>
          </View>
          {storeUrl ? (
            <Pressable
              style={[styles.primaryBtn, opening ? { opacity: 0.7 } : null]}
              onPress={() => void openStore()}
              disabled={opening}
            >
              <Text style={styles.primaryBtnText}>{opening ? "جارٍ الفتح..." : "تحديث الآن"}</Text>
            </Pressable>
          ) : (
            <Text style={styles.hint}>تواصل مع الإدارة لتحميل أحدث نسخة من التطبيق.</Text>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
