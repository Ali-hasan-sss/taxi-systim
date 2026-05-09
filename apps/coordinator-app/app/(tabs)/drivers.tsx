import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { useFocusEffect, useRouter } from "expo-router";
import { io, type Socket } from "socket.io-client";
import { coordinatorLiveDrivers, getSocketOrigin, type LiveDriverDto } from "../../src/lib/api";
import { clearSession, getSession } from "../../src/lib/session";

/** مركز افتراضي: طرطوس، سوريا */
const DEFAULT_REGION: Region = {
  latitude: 34.889,
  longitude: 35.886,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08
};

/** حالة واجهة السوكيت: أخضر متصل، برتقالي جاري/إعادة، أحمر غير متصل */
type SocketUiStatus = "connected" | "connecting" | "disconnected";

export default function DriversTab() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const fittedOnce = useRef(false);
  const pendingFitRegion = useRef<Region | null>(null);

  const [drivers, setDrivers] = useState<LiveDriverDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketUiStatus>("connecting");

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
      setDrivers(list);
      if (list.length > 0 && !fittedOnce.current) {
        const lat = list.reduce((s, d) => s + d.lat, 0) / list.length;
        const lng = list.reduce((s, d) => s + d.lng, 0) / list.length;
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

    const onLoc = (payload: { driverId?: string; lat?: number; lng?: number }) => {
      if (!payload?.driverId || typeof payload.lat !== "number" || typeof payload.lng !== "number") return;
      setDrivers((prev) => {
        const exists = prev.some((d) => d.driverId === payload.driverId);
        if (exists) {
          return prev.map((d) =>
            d.driverId === payload.driverId ? { ...d, lat: payload.lat!, lng: payload.lng! } : d
          );
        }
        void load();
        return prev;
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

  const recenter = () => {
    if (drivers.length === 0) return;
    const lat = drivers.reduce((s, d) => s + d.lat, 0) / drivers.length;
    const lng = drivers.reduce((s, d) => s + d.lng, 0) / drivers.length;
    const r: Region = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08
    };
    mapRef.current?.animateToRegion(r, 450);
  };

  const socketDotColor =
    socketStatus === "connected" ? "#22c55e" : socketStatus === "connecting" ? "#f97316" : "#ef4444";
  const socketLabel =
    socketStatus === "connected"
      ? "متصل — تحديثات لحظية"
      : socketStatus === "connecting"
        ? "جاري الاتصال…"
        : "غير متصل";

  return (
    <View style={styles.root}>
      <View style={styles.socketBar} accessibilityRole="text" accessibilityLabel={`حالة السوكيت: ${socketLabel}`}>
        <View style={[styles.socketDot, { backgroundColor: socketDotColor }]} />
        <Text style={styles.socketBarText}> {socketLabel}</Text>
      </View>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>السائقون النشطون</Text>
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
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={DEFAULT_REGION}
          mapType="standard"
          showsPointsOfInterest
          showsBuildings
          showsUserLocation={false}
          showsMyLocationButton={false}
        >
          {drivers.map((d) => (
            <Marker
              key={d.driverId}
              coordinate={{ latitude: d.lat, longitude: d.lng }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <View style={styles.markerWrap}>
                <View style={styles.markerBubble}>
                  <Text style={styles.markerName} numberOfLines={1}>
                    {d.fullName}
                  </Text>
                </View>
                <View style={styles.markerPin} />
              </View>
            </Marker>
          ))}
        </MapView>
      )}

      <View style={styles.footer}>
        <Text style={styles.count}>متصل على الخريطة: {drivers.length}</Text>
        <Text style={styles.mapHint}>
          أسماء الشوارع والمحال تظهر عبر خرائط النظام (Google / Apple) — قرّب الخريطة لرؤية التفاصيل.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a"
  },
  socketBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    paddingTop: 48,
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
    fontWeight: "700"
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
    flex: 1
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
    textAlign: "right"
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "right",
    lineHeight: 18
  },
  error: {
    marginTop: 8,
    color: "#f87171",
    fontSize: 12,
    textAlign: "right"
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
    fontSize: 12
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
  map: {
    flex: 1,
    width: "100%"
  },
  markerWrap: {
    alignItems: "center"
  },
  markerBubble: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#38bdf8",
    maxWidth: 160
  },
  markerName: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center"
  },
  markerPin: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563eb",
    marginTop: 4,
    borderWidth: 2,
    borderColor: "#fff"
  },
  footer: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#0f172a",
    borderTopWidth: 1,
    borderTopColor: "#1e293b"
  },
  count: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "right",
    fontWeight: "700"
  },
  mapHint: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 10,
    textAlign: "right",
    lineHeight: 15
  }
});
