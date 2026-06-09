import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import { useTheme, useThemedStyles } from "./ThemeProvider";

export function ThemeToggleRow({ inMenu = true }: { inMenu?: boolean }) {
  const { mode, toggleMode, theme } = useTheme();
  const iconColor = inMenu ? theme.colors.menuText : theme.colors.text;
  const styles = useThemedStyles((t) => ({
    row: {
      flexDirection: "row-reverse" as const,
      alignItems: "center" as const,
      justifyContent: "flex-end" as const,
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 4
    },
    text: {
      flex: 1,
      fontSize: 16,
      fontWeight: "800" as const,
      textAlign: "right" as const,
      color: inMenu ? t.colors.menuText : t.colors.text
    },
    hint: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: inMenu ? t.colors.menuTextSecondary : t.colors.textMuted
    }
  }));

  const isDark = mode === "dark";
  const label = isDark ? "الوضع الداكن" : "الوضع الفاتح";
  const nextLabel = isDark ? "التبديل إلى الفاتح" : "التبديل إلى الداكن";

  return (
    <Pressable
      style={styles.row}
      onPress={toggleMode}
      accessibilityRole="button"
      accessibilityLabel={nextLabel}
    >
      <View>
        <Text style={styles.text}>{label}</Text>
        <Text style={styles.hint}>{nextLabel}</Text>
      </View>
      <Ionicons name={isDark ? "moon" : "sunny"} size={22} color={iconColor} />
    </Pressable>
  );
}
