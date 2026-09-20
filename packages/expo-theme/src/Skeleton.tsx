import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "./ThemeProvider";

const PulseContext = createContext<Animated.Value | null>(null);

/** مجموعة عظام هيكل التحميل تشترك في نبضة واحدة متوافقة مع الثيم */
export function SkeletonGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.92, duration: 780, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.38, duration: 780, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <PulseContext.Provider value={opacity}>
      <View style={style}>{children}</View>
    </PulseContext.Provider>
  );
}

export function SkeletonBone({
  width = "100%",
  height = 12,
  radius = 8,
  style
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const shared = useContext(PulseContext);
  const local = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (shared) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(local, { toValue: 0.92, duration: 780, useNativeDriver: true }),
        Animated.timing(local, { toValue: 0.38, duration: 780, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [local, shared]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.colors.surfaceInset,
          opacity: shared ?? local
        },
        style
      ]}
    />
  );
}

/** خصائص السحب للتحديث — يجب تمرير RefreshControl نفسه للقائمة وليس مكوّناً ملفوفاً */
export function themedRefreshProps(theme: { colors: { primary: string; surfaceCard: string } }) {
  return {
    tintColor: theme.colors.primary,
    colors: [theme.colors.primary],
    progressBackgroundColor: theme.colors.surfaceCard
  };
}
