import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type CoordinatorOrderStats,
  type OrderBroadcastTarget,
  coordinatorCreateOrder,
  coordinatorMe,
  coordinatorOrderStats
} from "../../src/lib/api";
import { feedback } from "../../src/lib/feedback";
import { clearSession, getSession } from "../../src/lib/session";

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

function resetOrderForm(setters: {
  setFromAddr: (v: string) => void;
  setToAddr: (v: string) => void;
  setPhone: (v: string) => void;
  setAmountText: (v: string) => void;
  setBroadcast: (v: OrderBroadcastTarget) => void;
  setRefLat: (v: number | null) => void;
  setRefLng: (v: number | null) => void;
}) {
  setters.setFromAddr("");
  setters.setToAddr("");
  setters.setPhone("");
  setters.setAmountText("");
  setters.setBroadcast("ALL");
  setters.setRefLat(null);
  setters.setRefLng(null);
}

export default function HomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [name, setName] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  const [fromAddr, setFromAddr] = useState("");
  const [toAddr, setToAddr] = useState("");
  const [phone, setPhone] = useState("");
  const [amountText, setAmountText] = useState("");
  const [broadcast, setBroadcast] = useState<OrderBroadcastTarget>("ALL");
  const [refLat, setRefLat] = useState<number | null>(null);
  const [refLng, setRefLng] = useState<number | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderStats, setOrderStats] = useState<CoordinatorOrderStats>({
    active: 0,
    pending: 0,
    completed: 0,
    cancelled: 0
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
    await clearSession();
    router.replace("/login");
  };

  const fetchRefLocation = async () => {
    if (Platform.OS === "web") {
      feedback.warning("تحديد الموقع متاح في تطبيق الهاتف فقط، وليس من المتصفح.");
      return;
    }
    setLocLoading(true);
    try {
      const Location = await import("expo-location");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        feedback.info("لم يُمنح الإذن. يمكنك تفعيله من إعدادات الجهاز.", "الموقع");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setRefLat(pos.coords.latitude);
      setRefLng(pos.coords.longitude);
      feedback.success("تم حفظ موقعك كنقطة مرجعية لخيار أقرب السائقين.", "تم الحفظ");
    } catch {
      feedback.error("تعذر قراءة الموقع. تحقق من تشغيل GPS والمحاولة مجددًا.");
    } finally {
      setLocLoading(false);
    }
  };

  const submitOrder = async () => {
    const session = await getSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }

    const amount = Number(amountText.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      feedback.warning("أدخل تكلفة الطلب رقمًا صالحًا أكبر من صفر.");
      return;
    }
    if (!fromAddr.trim() || !toAddr.trim()) {
      feedback.warning("أدخل عنوان الانطلاق وعنوان الوجهة.");
      return;
    }
    const phoneOk = phone.trim().length >= 3;
    if (!phoneOk) {
      feedback.warning("أدخل رقم زبون صالحًا (3 أرقام على الأقل).");
      return;
    }

    if (broadcast === "NEAREST_THREE" && (refLat == null || refLng == null)) {
      feedback.warning('لخيار «أقرب 3 سائقين» اضغط أولًا «موقعي كنقطة مرجعية».');
      return;
    }

    setSubmitting(true);
    try {
      const created = await coordinatorCreateOrder(session.accessToken, {
        pickupAddress: fromAddr.trim(),
        dropoffAddress: toAddr.trim(),
        customerPhone: phone.trim(),
        amount,
        broadcastTarget: broadcast,
        pickupLat: broadcast === "NEAREST_THREE" ? refLat! : undefined,
        pickupLng: broadcast === "NEAREST_THREE" ? refLng! : undefined
      });
      feedback.success(
        `تم بث الطلب إلى السائقين.\nالمعرّف: ${created.id.slice(0, 8)}…`,
        "تم إنشاء الطلب"
      );
      resetOrderForm({
        setFromAddr,
        setToAddr,
        setPhone,
        setAmountText,
        setBroadcast,
        setRefLat,
        setRefLng
      });
      closeOrderModal();
      try {
        setOrderStats(await coordinatorOrderStats(session.accessToken));
      } catch {
        /* تجاهل فشل تحديث الإحصائيات */
      }
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إنشاء الطلب. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

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
        <Pressable
          onPress={() => setUserMenuOpen(true)}
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

      <Modal
        visible={userMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUserMenuOpen(false)}
      >
        <View style={styles.menuModalRoot} pointerEvents="box-none">
          <Pressable style={styles.menuBackdrop} onPress={() => setUserMenuOpen(false)} />
          <View
            style={[
              styles.dropdownPanel,
              { top: insets.top + 8, right: Math.max(16, insets.right + 4) }
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
              <Ionicons name="log-out-outline" size={22} color="#fecaca" />
              <Text style={styles.dropdownLogoutText}>تسجيل الخروج</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.scroll}
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

      <Modal
        visible={orderModalOpen}
        animationType="slide"
        transparent
        onRequestClose={closeOrderModal}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeOrderModal} accessibilityRole="button" />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboard}
          >
            <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>طلب جديد</Text>
              <Pressable onPress={closeOrderModal} hitSlop={12} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>إغلاق</Text>
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>يُبث الطلب فور الحفظ للسائقين حسب الخيار.</Text>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>من (الانطلاق)</Text>
              <TextInput
                value={fromAddr}
                onChangeText={setFromAddr}
                placeholder="عنوان أو وصف نقطة الانطلاق"
                placeholderTextColor="#64748b"
                style={styles.input}
                textAlign="right"
              />

              <Text style={styles.label}>إلى (الوجهة)</Text>
              <TextInput
                value={toAddr}
                onChangeText={setToAddr}
                placeholder="عنوان أو وصف الوجهة"
                placeholderTextColor="#64748b"
                style={styles.input}
                textAlign="right"
              />

              <Text style={styles.label}>رقم الزبون</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="07xxxxxxxx"
                placeholderTextColor="#64748b"
                style={styles.input}
                keyboardType="phone-pad"
                textAlign="right"
              />

              <Text style={styles.label}>تكلفة الطلب</Text>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                placeholder="مثال: 25 أو 25.5"
                placeholderTextColor="#64748b"
                style={styles.input}
                keyboardType="decimal-pad"
                textAlign="right"
              />

              <Text style={styles.label}>من يستقبل الطلب؟</Text>
              <View style={styles.row}>
                <Pressable
                  onPress={() => setBroadcast("ALL")}
                  style={[styles.chip, broadcast === "ALL" && styles.chipOn]}
                >
                  <Text style={[styles.chipText, broadcast === "ALL" && styles.chipTextOn]}>جميع السائقين</Text>
                </Pressable>
                <Pressable
                  onPress={() => setBroadcast("NEAREST_THREE")}
                  style={[styles.chip, broadcast === "NEAREST_THREE" && styles.chipOn]}
                >
                  <Text style={[styles.chipText, broadcast === "NEAREST_THREE" && styles.chipTextOn]}>
                    أقرب 3 سائقين
                  </Text>
                </Pressable>
              </View>

              {broadcast === "NEAREST_THREE" ? (
                <View style={styles.refBox}>
                  <Text style={styles.refHint}>
                    نحسب المسافة من موقعك الحالي إلى آخر مواقع السائقين المتصلين. يجب أن يسجّل السائق دخوله وموقعه عبر
                    التطبيق.
                  </Text>
                  <Pressable
                    onPress={fetchRefLocation}
                    disabled={locLoading}
                    style={[styles.refBtn, locLoading && styles.disabled]}
                  >
                    {locLoading ? (
                      <ActivityIndicator color="#e2e8f0" />
                    ) : (
                      <Text style={styles.refBtnText}>موقعي كنقطة مرجعية</Text>
                    )}
                  </Pressable>
                  {refLat != null && refLng != null ? (
                    <Text style={styles.refOk}>✓ تم حفظ الإحداثيات</Text>
                  ) : null}
                </View>
              ) : null}

              <Pressable
                onPress={submitOrder}
                disabled={submitting}
                style={[styles.submit, submitting && styles.disabled]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>إنشاء الطلب وبثّه</Text>
                )}
              </Pressable>
            </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: "#0f172a"
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
  dropdownPanel: {
    position: "absolute",
    minWidth: 220,
    maxWidth: "85%",
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
    textAlign: "right"
  },
  dropdownSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#94a3b8",
    textAlign: "right"
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: "#334155",
    marginVertical: 12
  },
  dropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4
  },
  dropdownLogoutText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fecaca"
  },
  scroll: {
    padding: 20,
    paddingBottom: 40
  },
  hero: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155"
  },
  greeting: {
    fontSize: 22,
    fontWeight: "800",
    color: "#f8fafc",
    textAlign: "right"
  },
  email: {
    marginTop: 6,
    color: "#94a3b8",
    textAlign: "right"
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#e2e8f0",
    textAlign: "right",
    marginBottom: 8
  },
  sectionHint: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "right",
    marginBottom: 16,
    lineHeight: 22
  },
  statsDayLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    textAlign: "right",
    marginBottom: 14,
    marginTop: -6
  },
  openOrderBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 24
  },
  openOrderBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16
  },
  label: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
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
    fontSize: 16
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
    fontSize: 14
  },
  chipTextOn: {
    color: "#38bdf8"
  },
  refBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155"
  },
  refHint: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 20,
    marginBottom: 12
  },
  refBtn: {
    backgroundColor: "#334155",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center"
  },
  refBtnText: {
    color: "#e2e8f0",
    fontWeight: "800"
  },
  refOk: {
    marginTop: 8,
    color: "#4ade80",
    textAlign: "right",
    fontWeight: "700"
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
    marginBottom: 4
  },
  statTilePending: {
    borderColor: "#b45309"
  },
  statTileActive: {
    borderColor: "#2563eb"
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
    textAlign: "right"
  },
  tileLabel: {
    marginTop: 6,
    fontSize: 13,
    color: "#94a3b8",
    textAlign: "right",
    fontWeight: "700"
  },
  tileSub: {
    marginTop: 4,
    fontSize: 11,
    color: "#64748b",
    textAlign: "right"
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
    maxHeight: "92%"
  },
  modalSheet: {
    maxHeight: "92%",
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "#334155",
    paddingBottom: 8
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f8fafc",
    textAlign: "right"
  },
  modalClose: {
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  modalCloseText: {
    color: "#38bdf8",
    fontWeight: "800",
    fontSize: 16
  },
  modalSubtitle: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 20
  },
  modalScroll: {
    flexGrow: 0
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32
  }
});
