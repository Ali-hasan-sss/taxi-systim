import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, direction: "rtl", backgroundColor: "#edf4ff" }}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#edf4ff", direction: "rtl" }
          }}
        />
      </View>
    </SafeAreaProvider>
  );
}
