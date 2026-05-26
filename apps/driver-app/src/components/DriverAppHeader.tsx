import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getDriverLocationAccessState, isDriverLocationReady } from "../lib/location-access";
import { shouldLoadExpoPushModule } from "../lib/push-environment";
import { clearDriverSession, getDriverSession } from "../lib/session";
import { useDriverStore } from "../store";
import { rtlText } from "../lib/rtl-text";

export function DriverAppHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isOnline, setOnline } = useDriverStore();
  const avatarAnchorRef = useRef<View>(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [name, setName] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");

  const refreshIdentity = useCallback(async () => {
    const s = await getDriverSession();
    if (s?.user) {
      setName(s.user.fullName || "");
      setPhoneDisplay(s.user.phone?.trim() || s.user.email?.trim() || "—");
    }
  }, []);

  useEffect(() => {
    void refreshIdentity();
  }, [refreshIdentity]);

  const logout = async () => {
    setUserMenuOpen(false);
    setUserMenuAnchor(null);
    if (shouldLoadExpoPushModule()) {
      const { unregisterDriverPushOnServer } = await import("../lib/expo-push");
      await unregisterDriverPushOnServer();
    }
    await clearDriverSession();
    router.replace("/login");
  };

  const startWork = async () => {
    const locationState = await getDriverLocationAccessState();
    if (!isDriverLocationReady(locationState)) {
      setOnline(false);
      closeMenu();
      router.replace("/location-access");
      return;
    }
    setOnline(true);
    closeMenu();
  };

  const closeMenu = () => {
    setUserMenuOpen(false);
    setUserMenuAnchor(null);
  };

  const openUserMenu = () => {
    const applyAnchor = (top: number, left: number, width: number) => {
      setUserMenuAnchor({ top, left, width });
      setUserMenuOpen(true);
    };

    const fallback = () => {
      const sw = Dimensions.get("window").width;
      const panelW = Math.min(260, sw * 0.88);
      const left = Math.max(12, sw - insets.right - panelW - 12);
      applyAnchor(insets.top + 52, left, panelW);
    };

    avatarAnchorRef.current?.measureInWindow((x, y, w, h) => {
      if (w <= 0 || h <= 0) {
        fallback();
        return;
      }
      const sw = Dimensions.get("window").width;
      const panelW = Math.min(Math.max(220, 260), sw * 0.88);
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
            accessibilityLabel="تطبيق السائق"
          />
        </View>
        <View ref={avatarAnchorRef} collapsable={false} style={styles.avatarAnchor}>
          <Pressable
            onPress={openUserMenu}
            style={styles.avatarBtn}
            accessibilityRole="button"
            accessibilityLabel="قائمة الحساب"
            hitSlop={8}
          >
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={20} color="#0f172a" />
            </View>
          </Pressable>
        </View>
      </View>

      <Modal visible={userMenuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={[styles.menuModalRoot, styles.rtlScreen]} pointerEvents="box-none">
          <Pressable style={styles.menuBackdrop} onPress={closeMenu} />
          <View style={styles.menuPositionLayer} pointerEvents="box-none">
            {userMenuAnchor ? (
              <View
                style={[
                  styles.dropdownPanel,
                  {
                    top: userMenuAnchor.top,
                    left: userMenuAnchor.left,
                    width: userMenuAnchor.width
                  }
                ]}
              >
                <Text style={styles.dropdownTitle} numberOfLines={1}>
                  {name || "سائق"}
                </Text>
                <Text style={styles.dropdownSubtitle} numberOfLines={1}>
                  {phoneDisplay}
                </Text>
                <Text style={styles.dropdownStatus}>
                  الحالة: {isOnline ? "متصل" : "غير متصل"}
                </Text>
                <View style={styles.dropdownDivider} />
                <Pressable
                  style={[styles.dropdownRow, isOnline && styles.dropdownRowDisabled]}
                  disabled={isOnline}
                  onPress={() => {
                    void startWork();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="بدء العمل — متصل"
                >
                  <Text style={[styles.dropdownActionText, isOnline && styles.dropdownMutedText]}>بدء العمل</Text>
                  <Ionicons name="play-circle-outline" size={22} color={isOnline ? "#94a3b8" : "#15803d"} />
                </Pressable>
                <Pressable
                  style={[styles.dropdownRow, !isOnline && styles.dropdownRowDisabled]}
                  disabled={!isOnline}
                  onPress={() => {
                    setOnline(false);
                    closeMenu();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="إيقاف العمل — غير متصل"
                >
                  <Text style={[styles.dropdownActionText, !isOnline && styles.dropdownMutedText]}>إيقاف العمل</Text>
                  <Ionicons name="stop-circle-outline" size={22} color={!isOnline ? "#94a3b8" : "#dc2626"} />
                </Pressable>
                <View style={styles.dropdownDivider} />
                <Pressable
                  style={styles.dropdownRow}
                  onPress={() => void logout()}
                  accessibilityRole="button"
                  accessibilityLabel="تسجيل الخروج"
                >
                  <Text style={styles.dropdownLogoutText}>تسجيل الخروج</Text>
                  <Ionicons name="log-out-outline" size={22} color="#dc2626" />
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  rtlScreen: {
    direction: "rtl",
    alignItems: "stretch"
  },
  topBar: {
    direction: "ltr",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#dbe4f0",
    minHeight: 68,
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 6
  },
  logoCreamBox: {
    height: 44,
    maxWidth: "30%",
    flexShrink: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 0,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  brandLogo: {
    height: 28,
    width: 128,
    maxWidth: "100%"
  },
  avatarAnchor: {
    justifyContent: "center",
    alignItems: "center"
  },
  avatarBtn: {
    justifyContent: "center",
    alignItems: "center"
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f8fbff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d7e3f4",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2
  },
  menuModalRoot: {
    flex: 1
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.28)"
  },
  menuPositionLayer: {
    ...StyleSheet.absoluteFillObject,
    direction: "ltr",
    pointerEvents: "box-none"
  },
  dropdownPanel: {
    position: "absolute",
    minWidth: 220,
    direction: "rtl",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 10
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText,
    textAlign: "right"
  },
  dropdownSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#94a3b8",
    ...rtlText,
    textAlign: "right"
  },
  dropdownStatus: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#cbd5e1",
    ...rtlText,
    textAlign: "right"
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: "#334155",
    marginVertical: 12
  },
  dropdownRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4
  },
  dropdownRowDisabled: {
    opacity: 0.55
  },
  dropdownActionText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#f1f5f9",
    ...rtlText,
    flex: 1,
    textAlign: "right"
  },
  dropdownMutedText: {
    color: "#64748b"
  },
  dropdownLogoutText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#dc2626",
    ...rtlText,
    flex: 1,
    textAlign: "right"
  }
});
