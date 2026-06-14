import { ThemeToggleRow, useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coordinatorMe } from "../lib/api";
import { shouldLoadExpoPushModule } from "../lib/push-environment";
import { clearSession, getSession } from "../lib/session";
import { rtlText } from "../lib/rtl-text";
import { ChatNavButton } from "./ChatNavButton";

export function CoordinatorAppHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const avatarAnchorRef = useRef<View>(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [name, setName] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");

  const styles = useThemedStyles((t) => ({
    rtlScreen: { direction: "rtl" as const, alignItems: "stretch" as const },
    topBar: {
      direction: "ltr" as const,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
      minHeight: 68,
      backgroundColor: t.colors.background
    },
    logoCreamBox: {
      height: 44,
      maxWidth: "30%",
      flexShrink: 1,
      backgroundColor: t.colors.logoBoxBg,
      borderWidth: 2,
      borderColor: t.colors.logoBoxBorder,
      borderRadius: 12,
      justifyContent: "center" as const,
      alignItems: "center" as const
    },
    brandLogo: { height: 28, width: 128, maxWidth: "100%" },
    topBarActions: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
    avatarAnchor: { justifyContent: "center" as const, alignItems: "center" as const },
    avatarBtn: { justifyContent: "center" as const, alignItems: "center" as const },
    avatarCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: t.colors.surfaceMuted,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 2,
      borderColor: t.colors.logoBoxBorder
    },
    menuModalRoot: { flex: 1 },
    menuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: t.colors.overlay },
    menuPositionLayer: { ...StyleSheet.absoluteFillObject, direction: "ltr" as const, pointerEvents: "box-none" as const },
    dropdownPanel: {
      position: "absolute" as const,
      minWidth: 220,
      direction: "rtl" as const,
      backgroundColor: t.colors.menuBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.colors.menuBorder,
      paddingVertical: 12,
      paddingHorizontal: 14,
      elevation: 12,
      zIndex: 10,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16
    },
    dropdownTitle: { fontSize: 16, fontWeight: "800" as const, color: t.colors.menuText, ...rtlText },
    dropdownSubtitle: { marginTop: 4, fontSize: 13, color: t.colors.menuTextSecondary, ...rtlText },
    dropdownDivider: { height: 1, backgroundColor: t.colors.menuDivider, marginVertical: 12 },
    dropdownRow: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      justifyContent: "flex-end" as const,
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 4
    },
    dropdownActionText: { fontSize: 16, fontWeight: "800" as const, color: t.colors.menuText, ...rtlText, flex: 1 },
    dropdownLogoutText: { fontSize: 16, fontWeight: "800" as const, color: t.colors.danger, ...rtlText, flex: 1 }
  }));

  const refreshIdentity = useCallback(async () => {
    const session = await getSession();
    if (!session?.accessToken) return;
    try {
      const me = await coordinatorMe(session.accessToken);
      setName(me.fullName);
      setPhoneDisplay(me.phone?.trim() || me.email?.trim() || "—");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshIdentity();
  }, [refreshIdentity]);

  const closeMenu = () => {
    setUserMenuOpen(false);
    setUserMenuAnchor(null);
  };

  const logout = async () => {
    closeMenu();
    if (shouldLoadExpoPushModule()) {
      const { unregisterCoordinatorPushOnServer } = await import("../lib/expo-push");
      await unregisterCoordinatorPushOnServer();
    }
    await clearSession();
    router.replace("/login");
  };

  const openUserMenu = () => {
    const applyAnchor = (top: number, left: number, width: number) => {
      setUserMenuAnchor({ top, left, width });
      setUserMenuOpen(true);
    };
    const fallback = () => {
      const sw = Dimensions.get("window").width;
      const panelW = Math.min(240, sw * 0.88);
      const left = Math.max(12, sw - insets.right - panelW - 12);
      applyAnchor(insets.top + 52, left, panelW);
    };
    avatarAnchorRef.current?.measureInWindow((x, y, w, h) => {
      if (w <= 0 || h <= 0) {
        fallback();
        return;
      }
      const sw = Dimensions.get("window").width;
      const panelW = Math.min(Math.max(220, 200), sw * 0.88);
      let left = x + w - panelW;
      if (left < 12) left = 12;
      if (left + panelW > sw - 12) left = sw - 12 - panelW;
      applyAnchor(y + h + 6, left, panelW);
    });
  };

  return (
    <>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View style={styles.logoCreamBox}>
          <Image
            source={require("../../assets/images/logo-removebg-preview.png")}
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityLabel="منسق التكسي"
          />
        </View>
        <View style={styles.topBarActions}>
          <ChatNavButton />
          <View ref={avatarAnchorRef} collapsable={false} style={styles.avatarAnchor}>
            <Pressable onPress={openUserMenu} style={styles.avatarBtn} accessibilityRole="button" accessibilityLabel="قائمة الحساب" hitSlop={8}>
              <View style={styles.avatarCircle}>
                <Ionicons name="person" size={20} color={theme.colors.text} />
              </View>
            </Pressable>
          </View>
        </View>
      </View>

      <Modal visible={userMenuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={[styles.menuModalRoot, styles.rtlScreen]} pointerEvents="box-none">
          <Pressable style={styles.menuBackdrop} onPress={closeMenu} />
          <View style={styles.menuPositionLayer} pointerEvents="box-none">
            {userMenuAnchor ? (
              <View style={[styles.dropdownPanel, { top: userMenuAnchor.top, left: userMenuAnchor.left, width: userMenuAnchor.width }]}>
                <Text style={styles.dropdownTitle} numberOfLines={1}>{name || "منسق"}</Text>
                <Text style={styles.dropdownSubtitle} numberOfLines={1}>{phoneDisplay}</Text>
                <View style={styles.dropdownDivider} />
                <Pressable
                  style={styles.dropdownRow}
                  onPress={() => {
                    closeMenu();
                    router.push("/change-password");
                  }}
                >
                  <Text style={styles.dropdownActionText}>تغيير كلمة المرور</Text>
                  <Ionicons name="key-outline" size={22} color={theme.colors.text} />
                </Pressable>
                <View style={styles.dropdownDivider} />
                <Pressable
                  style={styles.dropdownRow}
                  onPress={() => {
                    closeMenu();
                    router.push("/(tabs)/reports");
                  }}
                >
                  <Text style={styles.dropdownActionText}>التقارير</Text>
                  <Ionicons name="bar-chart-outline" size={22} color={theme.colors.text} />
                </Pressable>
                <View style={styles.dropdownDivider} />
                <ThemeToggleRow inMenu />
                <View style={styles.dropdownDivider} />
                <Pressable style={styles.dropdownRow} onPress={() => void logout()}>
                  <Text style={styles.dropdownLogoutText}>تسجيل الخروج</Text>
                  <Ionicons name="log-out-outline" size={22} color={theme.colors.dangerText} />
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
