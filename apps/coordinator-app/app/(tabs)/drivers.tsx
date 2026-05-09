import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import MapView, { Marker, UrlTile, type Region } from "react-native-maps";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { io, type Socket } from "socket.io-client";
import {
  coordinatorAssignOrder,
  coordinatorCreateOrder,
  coordinatorLiveDrivers,
  getSocketOrigin,
  type LiveDriverDto
} from "../../src/lib/api";
import Constants from "expo-constants";
import { feedback } from "../../src/lib/feedback";
import { clearSession, getSession } from "../../src/lib/session";
import { rtlText } from "../../src/lib/rtl-text";
import { buildWhatsAppChatUrl } from "../../src/lib/whatsapp";

/** مركز افتراضي: طرطوس، سوريا */
const DEFAULT_REGION: Region = {
  latitude: 34.889,
  longitude: 35.886,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08
};

/**
 * افتراضيًا: Carto Voyager (بيانات OpenStreetMap عبر CDN) — نادرًا ما يمنع طلبات تطبيقات الهاتف بـ 403 مثل tile.openstreetmap.org.
 * للخادم الرسمي OSMF يدويًا (قد يظل 403 على RN): ضع في expo.extra.mapTileUrlTemplate:
 * "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
 */
const DEFAULT_TILE_TEMPLATE =
  "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
const TILE_URL_TEMPLATE =
  (Constants.expoConfig?.extra as { mapTileUrlTemplate?: string } | undefined)?.mapTileUrlTemplate ??
  DEFAULT_TILE_TEMPLATE;

/** حجم لقطة العلامة الثابتة (أندرويد يعتمد عليه لتقليل القصّ). */
const MARKER_BITMAP_W = 288;
const MARKER_BITMAP_H = 136;
const MARKER_PILL_MIN_H = 56;
const MARKER_DOT_SIZE = 26;
/** نقطة الموقع ≈ مركز الدائرة من أعلى الصندوق */
const MARKER_ANCHOR_Y =
  (12 + MARKER_PILL_MIN_H + 10 + MARKER_DOT_SIZE / 2) / MARKER_BITMAP_H;

type SocketUiStatus = "connected" | "connecting" | "disconnected";

function isFiniteCoord(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isValidDriverCoord(d: { lat: unknown; lng: unknown }): d is { lat: number; lng: number } {
  return isFiniteCoord(d.lat) && isFiniteCoord(d.lng) && Math.abs(d.lat) <= 90 && Math.abs(d.lng) <= 180;
}

function DriverDetailCard(props: {
  driver: LiveDriverDto;
  onClose?: () => void;
  onWhatsApp: () => void;
  onAssign: () => void;
}) {
  const { driver: d, onClose, onWhatsApp, onAssign } = props;
  const busy = d.isBusy === true;
  const label = d.fullName?.trim() || "سائق";
  const ringColor = busy ? "#ea580c" : "#22c55e";
  const waUrl = buildWhatsAppChatUrl(d.phone);
  const initial = label.replace(/\s/g, "").charAt(0) || "؟";

  return (
    <View style={styles.calloutRoot}>
      <View style={[styles.calloutAccent, { backgroundColor: ringColor }]} />
      <View style={styles.calloutHeaderRow}>
        <View style={[styles.calloutAvatar, { borderColor: ringColor }]}>
          <Text style={styles.calloutAvatarText}>{initial}</Text>
        </View>
        <View style={styles.calloutHeaderText}>
          <Text style={styles.calloutName} numberOfLines={2}>
            {label}
          </Text>
          <View style={[styles.calloutPill, busy ? styles.calloutPillBusy : styles.calloutPillFree]}>
            <View style={[styles.calloutPillDot, { backgroundColor: ringColor }]} />
            <Text style={styles.calloutPillLabel}>{busy ? "مشغول — في رحلة" : "متاح الآن"}</Text>
          </View>
        </View>
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.driverCardCloseBtn}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
          >
            <Ionicons name="close" size={22} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>
      {d.phone ? (
        <View style={styles.calloutPhoneBlock}>
          <Text style={styles.calloutPhoneLabel}>الهاتف</Text>
          <Text style={styles.calloutPhone}>{d.phone}</Text>
        </View>
      ) : (
        <Text style={styles.calloutNoPhone}>لا يوجد رقم مسجّل</Text>
      )}
      <View style={styles.calloutDivider} />
      <View style={styles.calloutActions}>
        <Pressable
          style={[styles.calloutBtn, styles.calloutBtnWa, !waUrl && styles.calloutBtnDisabled]}
          disabled={!waUrl}
          onPress={onWhatsApp}
        >
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          <Text style={styles.calloutBtnWaText}>واتساب</Text>
        </Pressable>
        <Pressable
          style={[styles.calloutBtn, styles.calloutBtnAssign, busy && styles.calloutBtnDisabled]}
          disabled={busy}
          onPress={onAssign}
        >
          <Ionicons name="clipboard-outline" size={20} color="#fff" />
          <Text style={styles.calloutBtnAssignText}>إسناد طلب</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DriversTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const fittedOnce = useRef(false);
  const pendingFitRegion = useRef<Region | null>(null);

  const [drivers, setDrivers] = useState<LiveDriverDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketUiStatus>("connecting");
  const prevDriversCountRef = useRef(0);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDriver, setQuickDriver] = useState<LiveDriverDto | null>(null);
  const [quickFrom, setQuickFrom] = useState("");
  const [quickTo, setQuickTo] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [driverPanel, setDriverPanel] = useState<LiveDriverDto | null>(null);

  const removeDriver = useCallback((driverId: string) => {
    setDrivers((prev) => prev.filter((d) => d.driverId !== driverId));
  }, []);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await coordinatorLiveDrivers(session.accessToken);
      const safeList = list
        .filter((d) => isValidDriverCoord(d))
        .map((d) => ({ ...d, isBusy: d.isBusy === true }));
      setDrivers(safeList);
      if (safeList.length > 0 && !fittedOnce.current) {
        const lat = safeList.reduce((s, d) => s + d.lat, 0) / safeList.length;
        const lng = safeList.reduce((s, d) => s + d.lng, 0) / safeList.length;
        pendingFitRegion.current = {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08
        };
        fittedOnce.current = true;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "حدث خطأ";
      setError(msg);
      if (msg.includes("Unauthorized") || msg.includes("غير مصرح") || msg.includes("Forbidden")) {
        await clearSession();
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      fittedOnce.current = false;
      pendingFitRegion.current = null;
      void load();
    }, [load])
  );

  useEffect(() => {
    if (loading || !pendingFitRegion.current) return;
    const r = pendingFitRegion.current;
    pendingFitRegion.current = null;
    const t = setTimeout(() => mapRef.current?.animateToRegion(r, 500), 250);
    return () => clearTimeout(t);
  }, [loading, drivers.length]);

  useEffect(() => {
    const origin = getSocketOrigin();
    setSocketStatus("connecting");
    const socket: Socket = io(origin, { transports: ["websocket"] });

    const onConnect = () => setSocketStatus("connected");
    const onDisconnect = (reason: string) => {
      if (reason === "io client disconnect") return;
      if (reason === "io server disconnect") {
        setSocketStatus("disconnected");
        return;
      }
      setSocketStatus("connecting");
    };
    const onReconnectAttempt = () => setSocketStatus("connecting");
    const onReconnectFailed = () => setSocketStatus("disconnected");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect_failed", onReconnectFailed);

    const onLoc = (payload: { driverId?: string; lat?: number; lng?: number; isBusy?: boolean }) => {
      if (!payload?.driverId || !isFiniteCoord(payload.lat) || !isFiniteCoord(payload.lng)) return;
      if (Math.abs(payload.lat) > 90 || Math.abs(payload.lng) > 180) return;
      setDrivers((prev) => {
        const exists = prev.some((d) => d.driverId === payload.driverId);
        if (exists) {
          return prev.map((d) =>
            d.driverId === payload.driverId
              ? {
                  ...d,
                  lat: payload.lat!,
                  lng: payload.lng!,
                  isBusy: typeof payload.isBusy === "boolean" ? payload.isBusy : d.isBusy
                }
              : d
          );
        }
        const optimistic: LiveDriverDto = {
          driverId: payload.driverId,
          lat: payload.lat!,
          lng: payload.lng!,
          fullName: "سائق",
          phone: null,
          isBusy: payload.isBusy === true
        };
        void load();
        return [...prev, optimistic];
      });
    };

    const onOnline = (_p: { driverId?: string }) => {
      void load();
    };

    const onOffline = (payload: { driverId?: string }) => {
      if (payload?.driverId) removeDriver(payload.driverId);
    };

    socket.on("DRIVER_LOCATION_UPDATED", onLoc);
    socket.on("DRIVER_ONLINE", onOnline);
    socket.on("DRIVER_OFFLINE", onOffline);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect_failed", onReconnectFailed);
      socket.off("DRIVER_LOCATION_UPDATED", onLoc);
      socket.off("DRIVER_ONLINE", onOnline);
      socket.off("DRIVER_OFFLINE", onOffline);
      socket.disconnect();
    };
  }, [load, removeDriver]);

  useEffect(() => {
    if (drivers.length === 0) {
      prevDriversCountRef.current = 0;
      return;
    }
    const coords = drivers
      .filter((d) => isValidDriverCoord(d))
      .map((d) => ({ latitude: d.lat, longitude: d.lng }));
    if (coords.length === 0) return;
    const wasEmpty = prevDriversCountRef.current === 0;
    prevDriversCountRef.current = drivers.length;
    if (!wasEmpty) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 100, right: 36, bottom: 160, left: 36 },
        animated: true
      });
    }, 400);
    return () => clearTimeout(t);
  }, [drivers]);

  const recenter = () => {
    if (drivers.length === 0) return;
    const safe = drivers.filter((d) => isValidDriverCoord(d));
    if (safe.length === 0) return;
    const coords = safe.map((d) => ({ latitude: d.lat, longitude: d.lng }));
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 100, right: 36, bottom: 160, left: 36 },
      animated: true
    });
  };

  const openQuickOrderSheet = (d: LiveDriverDto) => {
    setDriverPanel(null);
    setQuickDriver(d);
    setQuickFrom("");
    setQuickTo("");
    setQuickPhone("");
    setQuickAmount("");
    setQuickOpen(true);
  };

  const closeQuickOrder = () => {
    if (quickSubmitting) return;
    setQuickOpen(false);
    setQuickDriver(null);
  };

  const submitQuickOrder = async () => {
    if (!quickDriver) return;
    if (quickDriver.isBusy) {
      feedback.warning("السائق مشغول برحلة حاليًا. انتظر حتى يصبح متاحًا.");
      return;
    }
    const session = await getSession();
    if (!session?.accessToken) {
      router.replace("/login");
      return;
    }
    const amount = Number(quickAmount.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      feedback.warning("أدخل تكلفة صالحة أكبر من صفر.");
      return;
    }
    if (!quickFrom.trim() || !quickTo.trim()) {
      feedback.warning("أدخل عنوان الانطلاق والوجهة.");
      return;
    }
    if (quickPhone.trim().length < 3) {
      feedback.warning("أدخل رقم زبون (3 أرقام على الأقل).");
      return;
    }

    setQuickSubmitting(true);
    try {
      const created = await coordinatorCreateOrder(session.accessToken, {
        pickupAddress: quickFrom.trim(),
        dropoffAddress: quickTo.trim(),
        customerPhone: quickPhone.trim(),
        amount,
        broadcastTarget: "ALL"
      });
      await coordinatorAssignOrder(session.accessToken, created.id, quickDriver.driverId);
      feedback.success(`تم إنشاء الطلب وإسناده إلى ${quickDriver.fullName}.`, "تم الإسناد");
      closeQuickOrder();
      void load();
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "تعذر إتمام الطلب.");
    } finally {
      setQuickSubmitting(false);
    }
  };

  const openWhatsApp = async (d: LiveDriverDto) => {
    const url = buildWhatsAppChatUrl(d.phone);
    if (!url) {
      feedback.info("لا يوجد رقم هاتف مسجّل لهذا السائق.", "واتساب");
      return;
    }
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else await Linking.openURL(url);
    } catch {
      feedback.error("تعذر فتح واتساب.");
    }
  };

  const socketDotColor =
    socketStatus === "connected" ? "#22c55e" : socketStatus === "connecting" ? "#f97316" : "#ef4444";
  const socketLabel =
    socketStatus === "connected"
      ? "متصل — مواقع السائقين تُحدَّث لحظيًا من أجهزتهم"
      : socketStatus === "connecting"
        ? "جاري الاتصال…"
        : "غير متصل";

  return (
    <View style={styles.root}>
      <View
        style={[styles.socketBar, { paddingTop: insets.top + 8 }]}
        accessibilityRole="text"
        accessibilityLabel={`حالة السوكيت: ${socketLabel}`}
      >
        <View style={[styles.socketDot, { backgroundColor: socketDotColor }]} />
        <Text style={styles.socketBarText}> {socketLabel}</Text>
      </View>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>السائقون النشطون</Text>
          <Text style={styles.headerHint}>انقر على العلامة (الاسم + الدائرة) لفتح بطاقة السائق.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => void load()} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>تحديث</Text>
          </Pressable>
          <Pressable onPress={recenter} style={styles.iconBtn} disabled={drivers.length === 0}>
            <Text style={[styles.iconBtnText, drivers.length === 0 && styles.iconBtnTextDisabled]}>توسيط</Text>
          </Pressable>
        </View>
      </View>

      {loading && drivers.length === 0 ? (
        <View style={styles.loadingMap}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      ) : (
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={DEFAULT_REGION}
            mapType={Platform.OS === "android" ? "none" : "standard"}
            removeClippedSubviews={false}
          >
            <UrlTile
              urlTemplate={TILE_URL_TEMPLATE}
              maximumZ={19}
              flipY={false}
              shouldReplaceMapContent={Platform.OS === "ios"}
            />
            {drivers.map((d) => {
              const busy = d.isBusy === true;
              const ringColor = busy ? "#ea580c" : "#22c55e";
              const label = d.fullName?.trim() || "سائق";
              return (
                <Marker
                  key={d.driverId}
                  coordinate={{ latitude: d.lat, longitude: d.lng }}
                  anchor={{ x: 0.5, y: MARKER_ANCHOR_Y }}
                  tracksViewChanges={Platform.OS === "android"}
                  onPress={() => setDriverPanel(d)}
                >
                  <View
                    style={styles.mapMarkerBitmapBox}
                    collapsable={false}
                    pointerEvents="box-none"
                  >
                    <View style={styles.mapMarkerRoot} pointerEvents="box-none">
                      <View style={[styles.mapNamePill, { borderColor: ringColor }]}>
                        <Text style={styles.mapNameText} numberOfLines={2} ellipsizeMode="tail">
                          {label}
                        </Text>
                      </View>
                      <View style={[styles.mapDot, { borderColor: ringColor }]} />
                    </View>
                  </View>
                </Marker>
              );
            })}
          </MapView>
          <Text style={styles.mapAttribution} pointerEvents="none">
            © OpenStreetMap · © CARTO — راجع osm.org/copyright
          </Text>
          {driverPanel ? (
            <View style={styles.driverPanelOverlay} pointerEvents="box-none">
              <Pressable
                style={styles.driverPanelBackdrop}
                onPress={() => setDriverPanel(null)}
                accessibilityRole="button"
                accessibilityLabel="إغلاق البطاقة"
              />
              <View style={styles.driverPanelBottom} pointerEvents="box-none">
                <DriverDetailCard
                  driver={driverPanel}
                  onClose={() => setDriverPanel(null)}
                  onWhatsApp={() => void openWhatsApp(driverPanel)}
                  onAssign={() => openQuickOrderSheet(driverPanel)}
                />
              </View>
            </View>
          ) : null}
        </View>
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 8 }]}>
        <Text style={styles.count}>على الخريطة: {drivers.length} سائق</Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#22c55e" }]} />
            <Text style={styles.legendText}>متاح</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#ea580c" }]} />
            <Text style={styles.legendText}>في رحلة (مشغول)</Text>
          </View>
        </View>
        <Text style={styles.mapHint}>
          انقر على كبسولة الاسم والدائرة لفتح البطاقة؛ المس المنطقة المعتمة أو «إغلاق» للرجوع. المواقع تُبث من تطبيق السائق عند «متصل».
        </Text>
      </View>

      <Modal visible={quickOpen} animationType="slide" transparent onRequestClose={closeQuickOrder}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.quickModalRoot}
        >
          <Pressable style={styles.quickBackdrop} onPress={closeQuickOrder} />
          <View style={[styles.quickSheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <Text style={styles.quickTitle}>طلب سريع للسائق</Text>
            {quickDriver ? (
              <Text style={styles.quickSubtitle}>
                {quickDriver.fullName}
                {quickDriver.isBusy ? " — مشغول (لا يمكن الإسناد الآن)" : ""}
              </Text>
            ) : null}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.quickScroll}
            >
              <Text style={styles.quickLabel}>من (الانطلاق)</Text>
              <TextInput
                value={quickFrom}
                onChangeText={setQuickFrom}
                placeholder="عنوان الانطلاق"
                placeholderTextColor="#64748b"
                style={styles.quickInput}
                editable={!quickSubmitting}
              />
              <Text style={styles.quickLabel}>إلى (الوجهة)</Text>
              <TextInput
                value={quickTo}
                onChangeText={setQuickTo}
                placeholder="عنوان الوجهة"
                placeholderTextColor="#64748b"
                style={styles.quickInput}
                editable={!quickSubmitting}
              />
              <Text style={styles.quickLabel}>هاتف الزبون</Text>
              <TextInput
                value={quickPhone}
                onChangeText={setQuickPhone}
                placeholder="07xxxxxxxx"
                placeholderTextColor="#64748b"
                style={styles.quickInput}
                keyboardType="phone-pad"
                editable={!quickSubmitting}
              />
              <Text style={styles.quickLabel}>التكلفة</Text>
              <TextInput
                value={quickAmount}
                onChangeText={setQuickAmount}
                placeholder="مثال: 25"
                placeholderTextColor="#64748b"
                style={styles.quickInput}
                keyboardType="decimal-pad"
                editable={!quickSubmitting}
              />
              <Text style={styles.quickHint}>يُنشأ الطلب ثم يُسند مباشرة لهذا السائق (بث «جميع السائقين» ثم إسناد).</Text>
            </ScrollView>
            <View style={styles.quickFooterBtns}>
              <Pressable
                style={[styles.quickCancelBtn, quickSubmitting && styles.calloutBtnDisabled]}
                disabled={quickSubmitting}
                onPress={closeQuickOrder}
              >
                <Text style={styles.quickCancelBtnText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={[styles.quickSaveBtn, (quickSubmitting || quickDriver?.isBusy) && styles.calloutBtnDisabled]}
                disabled={quickSubmitting || !!quickDriver?.isBusy}
                onPress={() => void submitQuickOrder()}
              >
                {quickSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.quickSaveBtnText}>إنشاء وإسناد</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a",
    direction: "rtl"
  },
  socketBar: {
    direction: "ltr",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: "#020617",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b"
  },
  socketDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  socketBarText: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "700",
    ...rtlText
  },
  header: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "#0f172a",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  headerText: {
    flex: 1,
    alignItems: "stretch"
  },
  headerHint: {
    marginTop: 4,
    fontSize: 11,
    color: "#64748b",
    ...rtlText
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText
  },
  error: {
    marginTop: 8,
    color: "#f87171",
    fontSize: 12,
    ...rtlText
  },
  iconBtn: {
    backgroundColor: "#334155",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10
  },
  iconBtnText: {
    color: "#e2e8f0",
    fontWeight: "800",
    fontSize: 12,
    ...rtlText
  },
  iconBtnTextDisabled: {
    opacity: 0.45
  },
  loadingMap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1e293b"
  },
  mapWrap: {
    flex: 1,
    position: "relative"
  },
  map: {
    flex: 1,
    width: "100%"
  },
  mapAttribution: {
    position: "absolute",
    left: 6,
    bottom: 6,
    maxWidth: "92%",
    fontSize: 9,
    lineHeight: 14,
    color: "#0f172a",
    backgroundColor: "rgba(248, 250, 252, 0.88)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
    ...rtlText
  },
  driverPanelOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end"
  },
  driverPanelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)"
  },
  driverPanelBottom: {
    paddingHorizontal: 12,
    paddingBottom: 10
  },
  driverCardCloseBtn: {
    marginTop: 2,
    padding: 4
  },
  mapMarkerBitmapBox: {
    width: MARKER_BITMAP_W,
    height: MARKER_BITMAP_H,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 12,
    paddingHorizontal: 10,
    paddingBottom: 14,
    backgroundColor: "rgba(255,255,255,0.001)"
  },
  mapMarkerRoot: {
    alignItems: "center",
    width: "100%",
    backgroundColor: "transparent",
    ...Platform.select({
      android: { direction: "ltr" },
      default: {}
    })
  },
  mapNamePill: {
    alignSelf: "center",
    width: MARKER_BITMAP_W - 20,
    maxWidth: MARKER_BITMAP_W - 20,
    minHeight: MARKER_PILL_MIN_H,
    justifyContent: "center",
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: "#f8fafc",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2
      },
      default: {}
    })
  },
  mapNameText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    lineHeight: 18,
    ...rtlText,
    ...Platform.select({ android: { includeFontPadding: false }, default: {} })
  },
  mapDot: {
    width: MARKER_DOT_SIZE,
    height: MARKER_DOT_SIZE,
    borderRadius: MARKER_DOT_SIZE / 2,
    backgroundColor: "#f8fafc",
    borderWidth: 3,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.22,
        shadowRadius: 2
      },
      default: {}
    })
  },
  calloutRoot: {
    width: "100%" as const,
    maxWidth: 400,
    alignSelf: "center",
    direction: "rtl",
    backgroundColor: "#0f172a",
    borderRadius: 18,
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
    ...Platform.select({
      android: { elevation: 12 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10
      }
    })
  },
  calloutAccent: {
    height: 4,
    width: "100%"
  },
  calloutHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 14
  },
  calloutAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1e293b",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  calloutAvatarText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f8fafc"
  },
  calloutHeaderText: {
    flex: 1,
    minWidth: 0
  },
  calloutName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText,
    marginBottom: 8
  },
  calloutPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999
  },
  calloutPillFree: {
    backgroundColor: "rgba(34, 197, 94, 0.15)"
  },
  calloutPillBusy: {
    backgroundColor: "rgba(234, 88, 12, 0.15)"
  },
  calloutPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  calloutPillLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#e2e8f0",
    ...rtlText
  },
  calloutPhoneBlock: {
    marginTop: 12,
    paddingHorizontal: 14
  },
  calloutPhoneLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 4,
    ...rtlText
  },
  calloutPhone: {
    fontSize: 14,
    color: "#cbd5e1",
    ...rtlText,
    fontVariant: ["tabular-nums"]
  },
  calloutNoPhone: {
    marginTop: 12,
    paddingHorizontal: 14,
    fontSize: 12,
    color: "#64748b",
    fontStyle: "italic",
    ...rtlText
  },
  calloutDivider: {
    height: 1,
    backgroundColor: "#1e293b",
    marginTop: 14,
    marginHorizontal: 14
  },
  calloutActions: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 14
  },
  calloutBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  calloutBtnWa: {
    backgroundColor: "#15803d"
  },
  calloutBtnWaText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    ...rtlText
  },
  calloutBtnAssign: {
    backgroundColor: "#2563eb"
  },
  calloutBtnAssignText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    ...rtlText
  },
  calloutBtnDisabled: {
    opacity: 0.45
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 8,
    alignItems: "center"
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  legendText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    ...rtlText
  },
  footer: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#0f172a",
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    alignItems: "stretch"
  },
  count: {
    color: "#94a3b8",
    fontSize: 13,
    ...rtlText,
    fontWeight: "700"
  },
  mapHint: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 10,
    ...rtlText,
    lineHeight: 15
  },
  quickModalRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  quickBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)"
  },
  quickSheet: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
    maxHeight: "88%"
  },
  quickTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f8fafc",
    ...rtlText,
    marginBottom: 6
  },
  quickSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    ...rtlText,
    marginBottom: 12
  },
  quickScroll: {
    paddingBottom: 12
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#cbd5e1",
    ...rtlText,
    marginBottom: 6,
    marginTop: 10
  },
  quickInput: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f8fafc",
    fontSize: 15,
    ...rtlText
  },
  quickHint: {
    marginTop: 12,
    fontSize: 12,
    color: "#64748b",
    ...rtlText,
    lineHeight: 18
  },
  quickFooterBtns: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8
  },
  quickCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#334155",
    alignItems: "center"
  },
  quickCancelBtnText: {
    color: "#e2e8f0",
    fontWeight: "800",
    fontSize: 15,
    ...rtlText
  },
  quickSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    alignItems: "center"
  },
  quickSaveBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    ...rtlText
  }
});
