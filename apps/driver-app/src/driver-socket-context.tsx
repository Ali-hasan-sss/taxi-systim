import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as Location from "expo-location";
import { io, type Socket } from "socket.io-client";
import { fetchDriverProfile, getSocketOrigin } from "./lib/api";
import { getDriverSession } from "./lib/session";
import { useDriverStore } from "./store";

type DriverSocketContextValue = {
  socket: Socket | null;
  myDriverId: string | null;
  /** اتصال السوكيت بالخادم (لا يعني «متصل» للعمل — انظر isOnline في الـ store) */
  socketConnected: boolean;
};

const DriverSocketContext = createContext<DriverSocketContextValue>({
  socket: null,
  myDriverId: null,
  socketConnected: false
});

/** فاصل بث الموقع للخادم (ثوانٍ) — يخفّض الضغط مع بقاء التحديث شبه لحظي */
export const DRIVER_LOCATION_BROADCAST_INTERVAL_MS = 10_000;

export function DriverSocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [myDriverId, setMyDriverId] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const myDriverIdRef = useRef<string | null>(null);
  const isOnline = useDriverStore((s) => s.isOnline);
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  useEffect(() => {
    let cancelled = false;
    let sock: Socket | null = null;

    void (async () => {
      const session = await getDriverSession();
      if (!session?.accessToken || cancelled) return;

      try {
        const profile = await fetchDriverProfile(session.accessToken);
        if (cancelled) return;
        myDriverIdRef.current = profile.id;
        setMyDriverId(profile.id);
      } catch {
        return;
      }

      const origin = getSocketOrigin();
      sock = io(origin, { transports: ["websocket"], autoConnect: true });
      if (cancelled) {
        sock.disconnect();
        return;
      }

      setSocket(sock);

      const onSockConnect = () => {
        setSocketConnected(true);
        const id = myDriverIdRef.current;
        if (!id || !sock) return;
        sock.emit("driver:register", id);
        if (isOnlineRef.current) sock.emit("driver:online", id);
        else sock.emit("driver:offline", id);
      };
      const onSockDisconnect = () => setSocketConnected(false);

      sock.on("connect", onSockConnect);
      sock.on("disconnect", onSockDisconnect);
      setSocketConnected(sock.connected);
      if (sock.connected) onSockConnect();
    })();

    return () => {
      cancelled = true;
      sock?.removeAllListeners();
      sock?.disconnect();
      setSocket(null);
      setMyDriverId(null);
      myDriverIdRef.current = null;
      setSocketConnected(false);
    };
  }, []);

  useEffect(() => {
    const s = socket;
    const id = myDriverId;
    if (!s?.connected || !id) return;
    if (isOnline) s.emit("driver:online", id);
    else s.emit("driver:offline", id);
  }, [isOnline, myDriverId, socket]);

  useEffect(() => {
    if (!isOnline || !myDriverId || !socket) return;

    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;

    const emitLoc = (lat: number, lng: number) => {
      if (!socket.connected) return;
      socket.emit("driver:location", { driverId: myDriverId, lat, lng });
    };

    const tryEmitCurrent = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) emitLoc(pos.coords.latitude, pos.coords.longitude);
      } catch {
        /* تجاهل */
      }
    };

    const onSocketConnect = () => {
      void tryEmitCurrent();
    };

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED || cancelled) return;

      socket.on("connect", onSocketConnect);

      if (socket.connected) void tryEmitCurrent();

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 0,
          timeInterval: DRIVER_LOCATION_BROADCAST_INTERVAL_MS
        },
        (loc) => {
          emitLoc(loc.coords.latitude, loc.coords.longitude);
        }
      );
    })();

    return () => {
      cancelled = true;
      socket.off("connect", onSocketConnect);
      void sub?.remove();
    };
  }, [isOnline, myDriverId, socket]);

  return (
    <DriverSocketContext.Provider value={{ socket, myDriverId, socketConnected }}>
      {children}
    </DriverSocketContext.Provider>
  );
}

export function useDriverSocket(): DriverSocketContextValue {
  return useContext(DriverSocketContext);
}
