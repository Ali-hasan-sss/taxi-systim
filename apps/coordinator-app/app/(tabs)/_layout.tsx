import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, usePathname } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coordinatorTabBarOuterHeight } from "../../src/lib/tab-bar-inset";
import { CoordinatorAppHeader } from "../../src/components/CoordinatorAppHeader";
import { CoordinatorCreateOrderModal } from "../../src/components/CoordinatorCreateOrderModal";
import { CoordinatorCreateOrderTabButton } from "../../src/components/CoordinatorCreateOrderTabButton";
import { useCoordinatorStore } from "../../src/store";

function OrdersTabIcon({ color, size }: { color: string; size?: number }) {
  const pathname = usePathname();
  const stuckOrdersCount = useCoordinatorStore((s) => s.stuckOrdersCount);
  const onOrdersTab = pathname.includes("orders");
  const showBadge = !onOrdersTab && stuckOrdersCount > 0;
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
      <Ionicons name="list-outline" size={s} color={color} />
      {showBadge ? (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeText}>{stuckOrdersCount > 9 ? "9+" : String(stuckOrdersCount)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ChatTabIcon({ color, size }: { color: string; size?: number }) {
  const pathname = usePathname();
  const unreadChatCount = useCoordinatorStore((s) => s.unreadChatCount);
  const onChatTab = pathname.includes("/chat");
  const showBadge = !onChatTab && unreadChatCount > 0;
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
      <Ionicons name="chatbubbles-outline" size={s} color={color} />
      {showBadge ? (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeText}>{unreadChatCount > 9 ? "9+" : String(unreadChatCount)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const bumpOrderRefresh = useCoordinatorStore((s) => s.bumpOrderRefresh);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <CoordinatorAppHeader />
    <Tabs
      screenOptions={{
        lazy: false,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.tabBarBorder,
          paddingTop: 14,
          paddingBottom: Math.max(insets.bottom, 8),
          height: coordinatorTabBarOuterHeight(insets.bottom),
          overflow: "visible" as const
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
        name="drivers"
        options={{
          title: "السائقين",
          tabBarLabel: "السائقين",
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size ?? 22} color={color} />
        }}
      />
      <Tabs.Screen
        name="create-order"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            setCreateOrderOpen(true);
          }
        }}
        options={{
          title: "",
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <CoordinatorCreateOrderTabButton {...props} onPress={() => setCreateOrderOpen(true)} />
          )
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
        name="chat"
        options={{
          title: "الدردشات",
          tabBarLabel: "الدردشات",
          tabBarIcon: ({ color, size }) => <ChatTabIcon color={color} size={size} />
        }}
      />
      <Tabs.Screen name="archive" options={{ href: null }} />
      <Tabs.Screen name="web-inquiries" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
    </Tabs>
    <CoordinatorCreateOrderModal
      visible={createOrderOpen}
      onClose={() => setCreateOrderOpen(false)}
      onCreated={() => {
        bumpOrderRefresh();
      }}
    />
    </View>
  );
}
