import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { rtlText } from "../lib/rtl-text";
import { useCoordinatorStore } from "../store";
import { GlassIconCircle } from "./GlassIconCircle";

export function WebInquiriesNavButton() {
  const router = useRouter();
  const { theme } = useTheme();
  const webInquiryCount = useCoordinatorStore((s) => s.webInquiryCount);
  const styles = useThemedStyles((t) => ({
    btn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: "transparent",
      position: "relative" as const
    },
    iconWrap: {
      position: "relative" as const,
      width: 24,
      height: 24,
      alignItems: "center" as const,
      justifyContent: "center" as const
    },
    badgeDot: {
      position: "absolute" as const,
      top: 0,
      end: 0,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 3,
      borderRadius: 8,
      backgroundColor: t.colors.badge,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 2,
      borderColor: t.colors.badgeBorder,
      zIndex: 2
    },
    badgeText: {
      color: t.colors.badgeText,
      fontSize: 9,
      fontWeight: "800" as const,
      ...rtlText
    }
  }));

  return (
    <Pressable
      style={styles.btn}
      onPress={() => router.push("/(tabs)/web-inquiries")}
      accessibilityRole="button"
      accessibilityLabel="طلبات الويب"
      hitSlop={8}
    >
      <GlassIconCircle>
        <View style={styles.iconWrap}>
          <Ionicons name="globe-outline" size={22} color={theme.colors.text} />
        </View>
      </GlassIconCircle>
      {webInquiryCount > 0 ? (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeText}>{webInquiryCount > 9 ? "9+" : String(webInquiryCount)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
