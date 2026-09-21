import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import type { ReactNode } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { driverHeaderOuterHeight } from "../lib/tab-bar-inset";

const DRIVER_BACKGROUND = require("../../assets/images/background.jpeg");

export function DriverScreenBackground({
  children,
  variant = "default"
}: {
  children: ReactNode;
  variant?: "default" | "auth";
}) {
  const { theme } = useTheme();
  const overlayColor =
    theme.mode === "dark"
      ? variant === "auth"
        ? "rgba(28, 25, 23, 0.84)"
        : "rgba(28, 25, 23, 0.8)"
      : variant === "auth"
        ? "rgba(255, 247, 237, 0.38)"
        : "rgba(255, 251, 235, 0.32)";

  const styles = useThemedStyles((t) => ({
    root: {
      flex: 1,
      backgroundColor: variant === "auth" ? t.colors.backgroundAuth : t.colors.background
    },
    image: {
      flex: 1,
      width: "100%",
      height: "100%"
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: overlayColor
    },
    content: {
      flex: 1,
      direction: "rtl" as const
    }
  }));

  return (
    <View style={styles.root}>
      <ImageBackground source={DRIVER_BACKGROUND} style={styles.image} resizeMode="cover">
        <View pointerEvents="none" style={styles.overlay} />
        <View style={styles.content}>{children}</View>
      </ImageBackground>
    </View>
  );
}

/** خلفية شاشات التبويب مع إزاحة لمحتوى الهيدر العائم */
export function DriverTabScreen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <DriverScreenBackground>
      <View style={{ flex: 1, paddingTop: driverHeaderOuterHeight(insets.top) }}>{children}</View>
    </DriverScreenBackground>
  );
}
