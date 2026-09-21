import { ThemeProvider, useTheme, SystemChrome, KeyboardInsetsProvider, NetworkOfflineBanner, ForceUpdateGate } from "@taxi/expo-theme";
import { resolveExpoApiBase } from "@taxi/expo-api-base";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ChatSocketProvider } from "../src/chat-socket-context";
import { ChatIncomingToastHost } from "../src/components/ChatIncomingToastHost";
import { CoordinatorPushBootstrap } from "../src/lib/expo-push";
import { FeedbackHost } from "../src/lib/feedback";

void SplashScreen.preventAutoHideAsync();

function RootLayoutInner() {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, direction: "rtl" as const, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.statusBar} />
      <NetworkOfflineBanner />
      <ForceUpdateGate
        apiBase={resolveExpoApiBase()}
        app="coordinator"
        currentVersion={Constants.expoConfig?.version ?? "0.0.0"}
      />
      <SystemChrome />
      <CoordinatorPushBootstrap />
      <ChatSocketProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent", direction: "rtl" }
          }}
        />
      </ChatSocketProvider>
      <ChatIncomingToastHost />
      <FeedbackHost />
    </View>
  );
}

/** RTL عبر forceRTL؛ شريط التنقل والنافبار LTR في (tabs)/_layout. */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardInsetsProvider>
          <ThemeProvider accent="coordinator">
            <RootLayoutInner />
          </ThemeProvider>
        </KeyboardInsetsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
