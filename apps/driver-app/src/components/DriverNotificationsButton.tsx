import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchDriverNotifications, markDriverNotificationsRead } from "../lib/api";
import { rtlText } from "../lib/rtl-text";
import { getDriverSession } from "../lib/session";
import { type DriverAppNotification, useDriverStore } from "../store";

function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `منذ ${days} يوم`;
  return date.toLocaleDateString("ar-SY", { day: "numeric", month: "short" });
}

function iconForType(type: string) {
  switch (type) {
    case "COMPENSATION":
      return "gift-outline" as const;
    case "FINE":
      return "alert-circle-outline" as const;
    case "COMMISSION_PAID":
      return "cash-outline" as const;
    case "DISABLED":
    case "DEBT_SUSPENDED":
      return "close-circle-outline" as const;
    case "ENABLED":
    case "DEBT_CLEARED":
      return "checkmark-circle-outline" as const;
    case "DEBT_WARNING":
      return "warning-outline" as const;
    default:
      return "notifications-outline" as const;
  }
}

export function DriverNotificationsButton() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const unreadCount = useDriverStore((s) => s.unreadNotificationCount);
  const notifications = useDriverStore((s) => s.notifications);
  const setNotifications = useDriverStore((s) => s.setNotifications);
  const markNotificationsRead = useDriverStore((s) => s.markNotificationsRead);
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  const styles = useThemedStyles((t) => ({
    btn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: t.colors.surfaceInset,
      borderWidth: 1,
      borderColor: t.colors.border
    },
    iconWrap: {
      position: "relative" as const,
      width: 24,
      height: 24,
      alignItems: "center" as const,
      justifyContent: "center" as const
    },
    badgeDot: {
      position: "absolute" as const,
      top: -6,
      end: -8,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 3,
      borderRadius: 8,
      backgroundColor: t.colors.badge,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 2,
      borderColor: t.colors.badgeBorder
    },
    badgeText: {
      color: t.colors.badgeText,
      fontSize: 9,
      fontWeight: "800" as const,
      ...rtlText
    },
    menuModalRoot: {
      flex: 1
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.colors.overlayLight
    },
    menuPositionLayer: {
      ...StyleSheet.absoluteFillObject,
      direction: "ltr" as const,
      pointerEvents: "box-none" as const
    },
    dropdownPanel: {
      position: "absolute" as const,
      maxHeight: 420,
      direction: "rtl" as const,
      backgroundColor: t.colors.menuBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.colors.menuBorder,
      overflow: "hidden" as const,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 12,
      zIndex: 10
    },
    dropdownHeader: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.menuDivider
    },
    dropdownTitle: {
      fontSize: 16,
      fontWeight: "800" as const,
      color: t.colors.menuText,
      ...rtlText
    },
    list: {
      maxHeight: 360
    },
    row: {
      flexDirection: "row-reverse" as const,
      alignItems: "flex-start" as const,
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.menuDivider
    },
    rowUnread: {
      backgroundColor: t.colors.surfaceInset
    },
    rowBody: {
      flex: 1
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: "800" as const,
      color: t.colors.menuText,
      ...rtlText
    },
    rowText: {
      marginTop: 4,
      fontSize: 13,
      lineHeight: 18,
      color: t.colors.menuTextSecondary,
      ...rtlText
    },
    rowTime: {
      marginTop: 6,
      fontSize: 11,
      color: t.colors.menuTextMuted,
      ...rtlText
    },
    empty: {
      paddingHorizontal: 14,
      paddingVertical: 28,
      alignItems: "center" as const
    },
    emptyText: {
      fontSize: 14,
      color: t.colors.menuTextMuted,
      ...rtlText
    }
  }));

  const loadNotifications = useCallback(async () => {
    const session = await getDriverSession();
    if (!session?.accessToken) return;
    try {
      const data = await fetchDriverNotifications(session.accessToken);
      setNotifications(data.notifications, data.unreadCount);
    } catch {
      /* يبقى ما في المتجر */
    }
  }, [setNotifications]);

  useEffect(() => {
    void loadNotifications();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadNotifications();
    });
    return () => sub.remove();
  }, [loadNotifications]);

  const close = () => {
    setOpen(false);
    setAnchor(null);
  };

  const openMenu = () => {
    const applyAnchor = (top: number, left: number, width: number) => {
      setAnchor({ top, left, width });
      setOpen(true);
    };
    const fallback = () => {
      const sw = Dimensions.get("window").width;
      const panelW = Math.min(320, sw * 0.92);
      const left = Math.max(12, sw - insets.right - panelW - 12);
      applyAnchor(insets.top + 52, left, panelW);
    };
    anchorRef.current?.measureInWindow((x, y, w, h) => {
      if (w <= 0 || h <= 0) {
        fallback();
        return;
      }
      const sw = Dimensions.get("window").width;
      const panelW = Math.min(320, sw * 0.92);
      let left = x + w - panelW;
      if (left < 12) left = 12;
      if (left + panelW > sw - 12) left = sw - 12 - panelW;
      applyAnchor(y + h + 6, left, panelW);
    });

    void (async () => {
      const session = await getDriverSession();
      if (!session?.accessToken) {
        markNotificationsRead();
        return;
      }
      try {
        const data = await fetchDriverNotifications(session.accessToken);
        const now = new Date().toISOString();
        setNotifications(
          data.notifications.map((n) => ({ ...n, readAt: n.readAt ?? now })),
          0
        );
        await markDriverNotificationsRead(session.accessToken);
      } catch {
        markNotificationsRead();
      }
    })();
  };

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <Pressable
          style={styles.btn}
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel="الإشعارات"
          hitSlop={8}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />
            {unreadCount > 0 ? (
              <View style={styles.badgeDot}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.menuModalRoot} pointerEvents="box-none">
          <Pressable style={styles.menuBackdrop} onPress={close} />
          <View style={styles.menuPositionLayer} pointerEvents="box-none">
            {anchor ? (
              <View
                style={[
                  styles.dropdownPanel,
                  {
                    top: anchor.top,
                    left: anchor.left,
                    width: anchor.width
                  }
                ]}
              >
                <View style={styles.dropdownHeader}>
                  <Text style={styles.dropdownTitle}>الإشعارات</Text>
                </View>
                {notifications.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>لا توجد إشعارات</Text>
                  </View>
                ) : (
                  <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                    {notifications.map((item: DriverAppNotification) => (
                      <View key={item.id} style={[styles.row, !item.readAt && styles.rowUnread]}>
                        <Ionicons name={iconForType(item.type)} size={20} color={theme.colors.menuText} />
                        <View style={styles.rowBody}>
                          <Text style={styles.rowTitle}>{item.title}</Text>
                          <Text style={styles.rowText}>{item.body}</Text>
                          <Text style={styles.rowTime}>{formatNotificationTime(item.createdAt)}</Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
