import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0f172a",
          borderTopColor: "#1e293b",
          paddingTop: 4,
          height: 62
        },
        tabBarActiveTintColor: "#38bdf8",
        tabBarInactiveTintColor: "#64748b",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" }
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
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size ?? 22} color={color} />
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
