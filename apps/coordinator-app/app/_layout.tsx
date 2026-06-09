import { ThemeProvider, useTheme, SystemChrome } from "@taxi/expo-theme";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ChatSocketProvider } from "../src/chat-socket-context";
import { FeedbackHost } from "../src/lib/feedback";

void SplashScreen.preventAutoHideAsync();

function RootLayoutInner() {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, direction: "rtl" as const, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.statusBar} />
      <SystemChrome />
      <ChatSocketProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background, direction: "rtl" }
          }}
        />
      </ChatSocketProvider>
      <FeedbackHost />
    </View>
  );
}

/** RTL عبر forceRTL؛ شريط التنقل والنافبار LTR في (tabs)/_layout. */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider accent="coordinator">
          <RootLayoutInner />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
