import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FeedbackHost } from "../src/lib/feedback";

void SplashScreen.preventAutoHideAsync();

/** تهيئة RTL في `index.js` قبل `expo-router`؛ على الويب يُكمّل `app/+html.tsx` بـ dir=rtl. */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, direction: "rtl" }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#0f172a", direction: "rtl" }
          }}
        />
        <FeedbackHost />
      </View>
    </SafeAreaProvider>
  );
}
