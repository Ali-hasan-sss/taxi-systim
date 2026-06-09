import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { rtlText } from "../lib/rtl-text";
import { useDriverStore } from "../store";

export function ChatNavButton() {
  const router = useRouter();
  const { theme } = useTheme();
  const unreadChatCount = useDriverStore((s) => s.unreadChatCount);
  const styles = useThemedStyles((t) => ({
    btn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: t.colors.surfaceInset,
      borderWidth: 1,
      borderColor: t.colors.border
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
      top: -6,
      end: -8,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 3,
      borderRadius: 8,
      backgroundColor: t.colors.badge,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 2,
      borderColor: t.colors.badgeBorder
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
      onPress={() => router.push("/(tabs)/chat")}
      accessibilityRole="button"
      accessibilityLabel="المحادثات"
      hitSlop={8}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="chatbubbles-outline" size={22} color={theme.colors.text} />
        {unreadChatCount > 0 ? (
          <View style={styles.badgeDot}>
            <Text style={styles.badgeText}>{unreadChatCount > 9 ? "9+" : String(unreadChatCount)}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
