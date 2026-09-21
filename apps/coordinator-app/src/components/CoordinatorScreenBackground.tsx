import { useTheme, useThemedStyles } from "@taxi/expo-theme";
import type { ReactNode } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coordinatorHeaderOuterHeight } from "../lib/tab-bar-inset";

const COORDINATOR_BACKGROUND = require("../../assets/images/background.jpeg");

export function CoordinatorScreenBackground({
  children,
  variant = "default"
}: {
  children: ReactNode;
  variant?: "default" | "auth";
}) {
  const { theme } = useTheme();
  const darkOverlay =
    theme.mode === "dark"
      ? variant === "auth"
        ? "rgba(28, 25, 23, 0.84)"
        : "rgba(28, 25, 23, 0.8)"
      : null;

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
      backgroundColor: darkOverlay ?? "transparent"
    },
    content: {
      flex: 1,
      direction: "rtl" as const
    }
  }));

  return (
    <View style={styles.root}>
      <ImageBackground source={COORDINATOR_BACKGROUND} style={styles.image} resizeMode="cover">
        {darkOverlay ? <View pointerEvents="none" style={styles.overlay} /> : null}
        <View style={styles.content}>{children}</View>
      </ImageBackground>
    </View>
  );
}

/** خلفية شاشات التبويب مع إزاحة لمحتوى الهيدر العائم */
export function CoordinatorTabScreen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <CoordinatorScreenBackground>
      <View style={{ flex: 1, paddingTop: coordinatorHeaderOuterHeight(insets.top) }}>{children}</View>
    </CoordinatorScreenBackground>
  );
}
