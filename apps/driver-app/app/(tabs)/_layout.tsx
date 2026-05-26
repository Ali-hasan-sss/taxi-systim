import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverAppHeader } from "../../src/components/DriverAppHeader";
import { DriverSocketProvider } from "../../src/driver-socket-context";
import { getDriverLocationAccessState, isDriverLocationReady } from "../../src/lib/location-access";
import { shouldLoadExpoPushModule } from "../../src/lib/push-environment";
import { getDriverSession } from "../../src/lib/session";
import { driverTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { rtlText } from "../../src/lib/rtl-text";
import { useDriverStore } from "../../src/store";

function OrdersTabIcon({ color, size }: { color: string; size?: number }) {
  const pathname = usePathname();
  const roomPendingCount = useDriverStore((s) => s.roomPendingCount);
  const onOrdersTab = pathname.includes("orders");
  const showBadge = !onOrdersTab && roomPendingCount > 0;
  const s = size ?? 22;

  return (
    <View style={styles.iconWrap}>
      <Ionicons name="clipboard-outline" size={s} color={color} />
      {showBadge ? (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeText}>{roomPendingCount > 9 ? "9+" : String(roomPendingCount)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    if (!shouldLoadExpoPushModule()) return;
    let cancelled = false;
    let removeTokenListener: (() => void) | undefined;
    let appSub: ReturnType<typeof AppState.addEventListener> | undefined;

    void import("../../src/lib/expo-push").then((mod) => {
      if (cancelled) return;
      void mod.ensurePushRegistrationForDriver();
      removeTokenListener = mod.subscribeDriverPushTokenRefresh();
      appSub = AppState.addEventListener("change", (state) => {
        if (state === "active") void mod.ensurePushRegistrationForDriver();
      });
    });

    return () => {
      cancelled = true;
      removeTokenListener?.();
      appSub?.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const verifyLocationAccess = async () => {
      const session = await getDriverSession();
      if (!session?.accessToken || cancelled) return;

      const locationState = await getDriverLocationAccessState();
      if (cancelled || isDriverLocationReady(locationState)) return;

      useDriverStore.getState().setOnline(false);
      router.replace("/location-access");
    };

    void verifyLocationAccess();
    const sub = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        void verifyLocationAccess();
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router]);

  return (
    <DriverSocketProvider>
    <View style={{ flex: 1, backgroundColor: "#edf4ff" }}>
      <DriverAppHeader />
      <Tabs
      screenOptions={{
        lazy: false,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#dbe4f0",
          borderTopWidth: 1,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 8),
          height: driverTabBarOuterHeight(insets.bottom),
          shadowColor: "#0f172a",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 12
        },
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#64748b",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          ...rtlText
        }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "الرئيسية",
          tabBarLabel: "الرئيسية",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size ?? 22} color={color} />
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "غرفة الطلبات",
          tabBarLabel: "غرفة الطلبات",
          tabBarIcon: ({ color, size }) => <OrdersTabIcon color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="archive"
        options={{
          title: "الأرشيف",
          tabBarLabel: "الأرشيف",
          tabBarIcon: ({ color, size }) => <Ionicons name="archive-outline" size={size ?? 22} color={color} />
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "التقارير",
          tabBarLabel: "التقارير",
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size ?? 22} color={color} />
        }}
      />
    </Tabs>
    </View>
    </DriverSocketProvider>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    position: "relative",
    width: 28,
    height: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeDot: {
    position: "absolute",
    top: -4,
    end: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff"
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    ...rtlText
  }
});
