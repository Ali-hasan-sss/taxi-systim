import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { AppState, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverAppHeader } from "../../src/components/DriverAppHeader";
import { DriverSocketProvider } from "../../src/driver-socket-context";
import { getDriverLocationAccessState, isDriverLocationReady } from "../../src/lib/location-access";
import { getDriverSession } from "../../src/lib/session";
import { driverTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { useDriverStore } from "../../src/store";

function OrdersTabIcon({ color, size }: { color: string; size?: number }) {
  const pathname = usePathname();
  const roomPendingCount = useDriverStore((s) => s.roomPendingCount);
  const onOrdersTab = pathname.includes("orders");
  const showBadge = !onOrdersTab && roomPendingCount > 0;
  const s = size ?? 22;
  const styles = useThemedStyles((t) => ({
    iconWrap: {
      position: "relative" as const,
      width: 28,
      height: 24,
      alignItems: "center" as const,
      justifyContent: "center" as const
    },
    badgeDot: {
      position: "absolute" as const,
      top: -4,
      end: -10,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      backgroundColor: t.colors.badge,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 2,
      borderColor: t.colors.badgeBorder
    },
    badgeText: {
      color: t.colors.badgeText,
      fontSize: 10,
      fontWeight: "800" as const,
      textAlign: "center" as const
    }
  }));

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
  const { theme } = useTheme();

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
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <DriverAppHeader />
        <Tabs
          screenOptions={{
            lazy: false,
            headerShown: false,
            tabBarHideOnKeyboard: true,
            tabBarStyle: {
              backgroundColor: theme.colors.tabBar,
              borderTopColor: theme.colors.tabBarBorder,
              borderTopWidth: 1,
              paddingTop: 4,
              paddingBottom: Math.max(insets.bottom, 8),
              height: driverTabBarOuterHeight(insets.bottom),
              shadowColor: theme.colors.shadow,
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.08,
              shadowRadius: 10,
              elevation: 12
            },
            tabBarActiveTintColor: theme.colors.tabActive,
            tabBarInactiveTintColor: theme.colors.tabInactive,
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: "700",
              textAlign: "center",
              writingDirection: "rtl"
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
          <Tabs.Screen name="chat" options={{ href: null }} />
          <Tabs.Screen
            name="archive"
            options={{
              title: "الأرشيف",
              tabBarLabel: "الأرشيف",
              tabBarIcon: ({ color, size }) => <Ionicons name="archive-outline" size={size ?? 22} color={color} />
            }}
          />
          <Tabs.Screen name="reports" options={{ href: null }} />
        </Tabs>
      </View>
    </DriverSocketProvider>
  );
}
