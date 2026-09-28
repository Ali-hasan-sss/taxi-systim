import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { GlassIconCircle } from "./GlassIconCircle";

export function CustomersNavButton() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(() => ({
    btn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: "transparent"
    }
  }));

  return (
    <Pressable
      style={styles.btn}
      onPress={() => router.push("/(tabs)/customers")}
      accessibilityRole="button"
      accessibilityLabel="الزبائن"
      hitSlop={8}
    >
      <GlassIconCircle>
        <Ionicons name="people-circle-outline" size={22} color={theme.colors.text} />
      </GlassIconCircle>
    </Pressable>
  );
}
