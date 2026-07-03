import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./ThemeProvider";
import { rtlText } from "./rtl";
import { useNetworkOffline } from "./useNetworkOffline";

/** شريط رفيع أعلى التطبيق عند انقطاع الشبكة */
export function NetworkOfflineBanner() {
  const offline = useNetworkOffline();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  if (!offline) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        backgroundColor: theme.colors.offline,
        paddingTop: insets.top,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.danger
      }}
    >
      <View style={{ paddingVertical: 5, paddingHorizontal: 12, alignItems: "center" as const }}>
        <Text
          style={{
            color: theme.colors.textInverse,
            fontSize: 12,
            fontWeight: "800" as const,
            ...rtlText,
            textAlign: "center" as const
          }}
        >
          لا يوجد اتصال بالشبكة
        </Text>
      </View>
    </View>
  );
}
