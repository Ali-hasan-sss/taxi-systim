import { useThemedStyles } from "@taxi/expo-theme";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export function DriverScreenBackground({
  children,
  variant = "default"
}: {
  children: ReactNode;
  variant?: "default" | "auth";
}) {
  const styles = useThemedStyles((theme) => ({
    root: {
      flex: 1,
      backgroundColor: variant === "auth" ? theme.colors.backgroundAuth : theme.colors.background
    },
    rootAuth: {},
    decorLayer: {
      ...StyleSheet.absoluteFillObject,
      overflow: "hidden" as const
    },
    content: {
      flex: 1,
      direction: "rtl" as const
    },
    topWash: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      height: 220,
      backgroundColor: theme.colors.glowWash
    },
    glowOrb: {
      position: "absolute" as const,
      borderRadius: 9999
    },
    glowOrbPrimary: {
      width: 260,
      height: 260,
      top: variant === "auth" ? -70 : -84,
      right: variant === "auth" ? -30 : -52,
      backgroundColor: theme.colors.glowPrimary
    },
    glowOrbSecondary: {
      width: 230,
      height: 230,
      top: 180,
      left: -96,
      backgroundColor: theme.colors.glowSecondary
    },
    glowOrbAccent: {
      width: 210,
      height: 210,
      bottom: variant === "auth" ? 120 : 54,
      right: variant === "auth" ? -88 : -76,
      backgroundColor: theme.colors.glowAccent
    }
  }));

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.decorLayer}>
        <View style={[styles.glowOrb, styles.glowOrbPrimary]} />
        <View style={[styles.glowOrb, styles.glowOrbSecondary]} />
        <View style={[styles.glowOrb, styles.glowOrbAccent]} />
        <View style={styles.topWash} />
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}
