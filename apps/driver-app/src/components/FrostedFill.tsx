import { useTheme } from "@taxi/expo-theme";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  /** كثافة الطبقة على أندرويد (أعلى = أقل شفافية) */
  androidOpacity?: number;
};

/**
 * تمويه مقصوص داخل الحاوية فقط.
 * على أندرويد لا نستخدم dimezisBlurView لأنه يغطي الشاشة كاملة.
 */
export function FrostedFill({ intensity = 44, style, androidOpacity }: Props) {
  const { theme } = useTheme();
  const dark = theme.mode === "dark";
  const tint = dark ? "dark" : "light";

  if (Platform.OS === "ios") {
    return <BlurView intensity={intensity} tint={tint} style={style} />;
  }

  const alpha = androidOpacity ?? Math.min(0.58, 0.34 + intensity / 220);
  return (
    <View
      pointerEvents="none"
      style={[
        style,
        {
          backgroundColor: dark ? `rgba(15, 23, 42, ${alpha})` : `rgba(255, 255, 255, ${alpha})`
        }
      ]}
    />
  );
}

export const frostedFillStyle = StyleSheet.absoluteFill;
