import { useTheme } from "@taxi/expo-theme";
import { BlurView } from "expo-blur";
import { StyleSheet, View } from "react-native";

/** شريط تنقل زجاجي: تمويه الخلفية مع طبقة خفيفة حسب الوضع الفاتح/الداكن */
export function CoordinatorTabBarBackground() {
  const { theme } = useTheme();
  const dark = theme.mode === "dark";

  return (
    <View style={styles.root} pointerEvents="none">
      <BlurView
        intensity={dark ? 48 : 64}
        tint={dark ? "dark" : "light"}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: dark ? "rgba(28, 25, 23, 0.38)" : "rgba(255, 251, 235, 0.4)",
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: dark ? "rgba(255, 255, 255, 0.14)" : "rgba(28, 25, 23, 0.12)"
          }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden"
  }
});
