import { useThemedStyles } from "@taxi/expo-theme";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { Pressable, Text, View } from "react-native";

const FAB_SIZE = 58;

export function CoordinatorCreateOrderTabButton({
  onPress,
  accessibilityState,
  ...props
}: BottomTabBarButtonProps & { onPress: () => void }) {
  const styles = useThemedStyles((t) => ({
    wrapper: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "flex-start" as const,
      top: -(FAB_SIZE / 2)
    },
    circle: {
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: FAB_SIZE / 2,
      backgroundColor: t.colors.primary,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 4,
      borderColor: t.colors.tabBar,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 14
    },
    plus: {
      color: t.colors.textInverse,
      fontSize: 32,
      fontWeight: "300" as const,
      lineHeight: 34,
      marginTop: -2
    }
  }));

  return (
    <Pressable
      {...props}
      onPress={onPress}
      style={styles.wrapper}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel="طلب جديد"
    >
      <View style={styles.circle}>
        <Text style={styles.plus}>+</Text>
      </View>
    </Pressable>
  );
}
