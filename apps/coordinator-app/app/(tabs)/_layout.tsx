import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, usePathname } from "expo-router";
import { useEffect } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { shouldLoadExpoPushModule } from "../../src/lib/push-environment";
import { coordinatorTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { rtlText } from "../../src/lib/rtl-text";
import { useCoordinatorStore } from "../../src/store";

function OrdersTabIcon({ color, size }: { color: string; size?: number }) {
  const pathname = usePathname();
  const stuckOrdersCount = useCoordinatorStore((s) => s.stuckOrdersCount);
  const onOrdersTab = pathname.includes("orders");
  const showBadge = !onOrdersTab && stuckOrdersCount > 0;
  const s = size ?? 22;

  return (
    <View style={styles.iconWrap}>
      <Ionicons name="list-outline" size={s} color={color} />
      {showBadge ? (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeText}>{stuckOrdersCount > 9 ? "9+" : String(stuckOrdersCount)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!shouldLoadExpoPushModule()) return;
    let cancelled = false;
    let removeTokenListener: (() => void) | undefined;
    let appSub: ReturnType<typeof AppState.addEventListener> | undefined;

    void import("../../src/lib/expo-push").then((mod) => {
      if (cancelled) return;
      void mod.ensurePushRegistrationForCoordinator();
      removeTokenListener = mod.subscribeCoordinatorPushTokenRefresh();
      appSub = AppState.addEventListener("change", (state) => {
        if (state === "active") void mod.ensurePushRegistrationForCoordinator();
      });
    });

    return () => {
      cancelled = true;
      removeTokenListener?.();
      appSub?.remove();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        lazy: false,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: "#0f172a",
          borderTopColor: "#1e293b",
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 8),
          height: coordinatorTabBarOuterHeight(insets.bottom)
        },
        tabBarActiveTintColor: "#38bdf8",
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
        name="drivers"
        options={{
          title: "السائقين",
          tabBarLabel: "السائقين",
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size ?? 22} color={color} />
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "الطلبات",
          tabBarLabel: "الطلبات",
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
    </Tabs>
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
    borderColor: "#0f172a"
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    ...rtlText
  }
});
