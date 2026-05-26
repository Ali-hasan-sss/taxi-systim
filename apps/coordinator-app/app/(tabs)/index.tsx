import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CoordinatorCreateOrderModal } from "../../src/components/CoordinatorCreateOrderModal";
import {
  type CoordinatorOrderStats,
  coordinatorMe,
  coordinatorOrderStats
} from "../../src/lib/api";
import { feedback } from "../../src/lib/feedback";
import { shouldLoadExpoPushModule } from "../../src/lib/push-environment";
import { clearSession, getSession } from "../../src/lib/session";
import { coordinatorTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { rtlText } from "../../src/lib/rtl-text";

/** عرض تاريخ ملخص «اليوم» (YYYY-MM-DD من الخادم) بصيغة عربية بتوقيت سوريا */
function formatSyriaDayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const anchor = Date.UTC(y, mo - 1, d, 12, 0, 0);
  try {
    return new Intl.DateTimeFormat("ar-SY", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Damascus"
    }).format(new Date(anchor));
  } catch {
    return ymd;
  }
}

export default function HomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const avatarAnchorRef = useRef<View>(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [name, setName] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderStats, setOrderStats] = useState<CoordinatorOrderStats>({
    active: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
    stuckToday: 0
  });

  const closeOrderModal = () => {
    setOrderModalOpen(false);
  };

  const openOrderModal = () => {
    setOrderModalOpen(true);
  };

  const loadDashboard = useCallback(async () => {
    const session = await getSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }
    const [me, stats] = await Promise.all([
      coordinatorMe(session.accessToken),
      coordinatorOrderStats(session.accessToken)
    ]);
    setName(me.fullName);
    setPhoneDisplay(me.phone?.trim() || me.email?.trim() || "—");
    setOrderStats(stats);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let ok = true;
      (async () => {
        try {
          await loadDashboard();
        } catch {
          if (ok) {
            await clearSession();
            router.replace("/login");
          }
        }
      })();
      return () => {
        ok = false;
        setUserMenuOpen(false);
        setUserMenuAnchor(null);
      };
    }, [loadDashboard])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadDashboard();
    } catch {
      await clearSession();
      router.replace("/login");
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard]);

  const logout = async () => {
    setUserMenuOpen(false);
    setUserMenuAnchor(null);
    if (shouldLoadExpoPushModule()) {
      const { unregisterCoordinatorPushOnServer } = await import("../../src/lib/expo-push");
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

  const homeScrollBottomPad = 40 + coordinatorTabBarOuterHeight(insets.bottom);

  return (
    <View style={styles.shell}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View style={styles.logoCreamBox}>
          <Image
            source={require("../../assets/images/logo-removebg-preview.png")}
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityLabel="منسق التكسي"
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

      <Modal
        visible={userMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setUserMenuOpen(false);
          setUserMenuAnchor(null);
        }}
      >
        <View style={[styles.menuModalRoot, styles.rtlScreen]} pointerEvents="box-none">
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => {
              setUserMenuOpen(false);
              setUserMenuAnchor(null);
            }}
          />
          {/* طبقة LTR فقط لموضع القائمة: measureInWindow إحداثيات فيزيائية؛ مع RTL العام كان left يُعكس */}
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
                  {name || "منسق"}
                </Text>
                <Text style={styles.dropdownSubtitle} numberOfLines={1}>
                  {phoneDisplay}
                </Text>
                <View style={styles.dropdownDivider} />
                <Pressable
                  style={styles.dropdownRow}
                  onPress={() => void logout()}
                  accessibilityRole="button"
                  accessibilityLabel="تسجيل الخروج"
                >
                  <Text style={styles.dropdownLogoutText}>تسجيل الخروج</Text>
                  <Ionicons name="log-out-outline" size={22} color="#fecaca" />
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scroll, { paddingBottom: homeScrollBottomPad }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />}
      >
        <View style={styles.hero}>
          <Text style={styles.greeting}>مرحبًا، {name || "..."}</Text>
        </View>

        <Text style={styles.sectionTitle}>لوحة المنسق</Text>
        <Text style={styles.sectionHint}>أنشئ طلبًا جديدًا ويُبث فورًا للسائقين عبر الشبكة.</Text>

        <Pressable onPress={openOrderModal} style={styles.openOrderBtn}>
          <Text style={styles.openOrderBtnText}>＋ طلب جديد</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>ملخص طلباتي اليوم</Text>
       
        {orderStats.summaryDaySyria ? (
          <Text style={styles.statsDayLabel}>{formatSyriaDayLabel(orderStats.summaryDaySyria)}</Text>
        ) : null}

        <View style={styles.statsGrid}>
          <View style={[styles.statTile, styles.statTilePending]}>
            <Text style={styles.tileValue}>{orderStats.pending}</Text>
            <Text style={styles.tileLabel}>طلبات معلقة</Text>
          </View>
          <View style={[styles.statTile, styles.statTileActive]}>
            <Text style={styles.tileValue}>{orderStats.active}</Text>
            <Text style={styles.tileLabel}>رحلات نشطة</Text>
          </View>
          <View style={[styles.statTile, styles.statTileStuck]}>
            <Text style={styles.tileValue}>{orderStats.stuckToday}</Text>
            <Text style={styles.tileLabel}>متعثرة اليوم</Text>
          </View>
          <View style={[styles.statTile, styles.statTileDone]}>
            <Text style={styles.tileValue}>{orderStats.completed}</Text>
            <Text style={styles.tileLabel}>مكتملة</Text>
          </View>
          <View style={[styles.statTile, styles.statTileCancelled]}>
            <Text style={styles.tileValue}>{orderStats.cancelled}</Text>
            <Text style={styles.tileLabel}>ملغاة</Text>
          </View>
        </View>
      </ScrollView>

      <CoordinatorCreateOrderModal
        visible={orderModalOpen}
        onClose={closeOrderModal}
        onCreated={async () => {
          const session = await getSession();
          if (!session?.accessToken) return;
          try {
            setOrderStats(await coordinatorOrderStats(session.accessToken));
          } catch {
            /* ignore */
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rtlScreen: {
    direction: "rtl",
    alignItems: "stretch"
  },
  shell: {
    flex: 1,
    backgroundColor: "#0f172a",
    direction: "rtl"
  },
  /** ارتفاع موحّد للّوجو وللأفتار (44). direction ltr يثبّت الشعار يسار الشاشة والأفتار يمينها مع RTL للنصوص. */
  topBar: {
    direction: "ltr",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    minHeight: 68
  },
  logoCreamBox: {
    height: 44,
    maxWidth: "30%",
    flexShrink: 1,
    backgroundColor: "#faf6f0",
    borderWidth: 2,
    borderColor: "#94a3b8",
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
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#94a3b8"
  },
  menuModalRoot: {
    flex: 1
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)"
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
    ...rtlText
  },
  dropdownSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#94a3b8",
    ...rtlText
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: "#334155",
    marginVertical: 12
  },
  dropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4
  },
  dropdownLogoutText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fecaca",
    ...rtlText,
    flex: 1
  },
  scrollView: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    direction: "rtl"
  },
  scroll: {
    flexGrow: 1,
    padding: 20,
    alignItems: "stretch",
    direction: "rtl",
    width: "100%"
  },
  hero: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "stretch"
  },
  greeting: {
    fontSize: 22,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText
  },
  email: {
    marginTop: 6,
    color: "#94a3b8",
    ...rtlText
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#e2e8f0",
    ...rtlText,
    marginBottom: 8
  },
  sectionHint: {
    fontSize: 14,
    color: "#94a3b8",
    ...rtlText,
    marginBottom: 16,
    lineHeight: 22
  },
  statsDayLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    ...rtlText,
    marginBottom: 14,
    marginTop: -6
  },
  openOrderBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24
  },
  openOrderBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    textAlign: "center",
    writingDirection: "rtl",
    width: "100%"
  },
  label: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "700",
    ...rtlText,
    marginBottom: 6,
    marginTop: 10
  },
  input: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f8fafc",
    fontSize: 16,
    ...rtlText
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: 12
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155"
  },
  chipOn: {
    borderColor: "#38bdf8",
    backgroundColor: "#0c4a6e33"
  },
  chipText: {
    color: "#94a3b8",
    fontWeight: "700",
    fontSize: 14,
    ...rtlText
  },
  chipTextOn: {
    color: "#38bdf8"
  },
  submit: {
    marginTop: 20,
    marginBottom: 24,
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center"
  },
  submitText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16
  },
  disabled: {
    opacity: 0.65
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between"
  },
  statTile: {
    width: "48%",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 4,
    alignItems: "stretch"
  },
  statTilePending: {
    borderColor: "#b45309"
  },
  statTileActive: {
    borderColor: "#2563eb"
  },
  statTileStuck: {
    borderColor: "#c2410c"
  },
  statTileDone: {
    borderColor: "#15803d"
  },
  statTileCancelled: {
    borderColor: "#991b1b"
  },
  tileValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#38bdf8",
    ...rtlText
  },
  tileLabel: {
    marginTop: 6,
    fontSize: 13,
    color: "#94a3b8",
    ...rtlText,
    fontWeight: "700"
  },
  tileSub: {
    marginTop: 4,
    fontSize: 11,
    color: "#64748b",
    ...rtlText
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  modalKeyboard: {
    width: "100%",
    maxHeight: "92%",
    flexShrink: 1
  },
  modalSheet: {
    width: "100%",
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden"
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
    alignSelf: "stretch"
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText,
    flex: 1
  },
  modalClose: {
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  modalCloseText: {
    color: "#38bdf8",
    fontWeight: "800",
    fontSize: 16,
    ...rtlText
  },
  modalSubtitle: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    color: "#94a3b8",
    fontSize: 13,
    ...rtlText,
    lineHeight: 20
  },
  modalScroll: {
    flex: 1,
    minHeight: 0,
    width: "100%"
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    alignItems: "stretch",
    direction: "rtl"
  }
});
