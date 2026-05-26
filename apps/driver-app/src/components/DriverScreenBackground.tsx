import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export function DriverScreenBackground({
  children,
  variant = "default"
}: {
  children: ReactNode;
  variant?: "default" | "auth";
}) {
  return (
    <View style={[styles.root, variant === "auth" && styles.rootAuth]}>
      <View pointerEvents="none" style={styles.decorLayer}>
        <View style={[styles.glowOrb, styles.glowOrbPrimary, variant === "auth" && styles.glowOrbPrimaryAuth]} />
        <View style={[styles.glowOrb, styles.glowOrbSecondary]} />
        <View style={[styles.glowOrb, styles.glowOrbAccent, variant === "auth" && styles.glowOrbAccentAuth]} />
        <View style={styles.topWash} />
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#edf4ff"
  },
  rootAuth: {
    backgroundColor: "#f3f7ff"
  },
  decorLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden"
  },
  content: {
    flex: 1,
    direction: "rtl"
  },
  topWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: "rgba(255,255,255,0.35)"
  },
  glowOrb: {
    position: "absolute",
    borderRadius: 9999
  },
  glowOrbPrimary: {
    width: 260,
    height: 260,
    top: -84,
    right: -52,
    backgroundColor: "rgba(37, 99, 235, 0.16)"
  },
  glowOrbPrimaryAuth: {
    top: -70,
    right: -30,
    backgroundColor: "rgba(59, 130, 246, 0.14)"
  },
  glowOrbSecondary: {
    width: 230,
    height: 230,
    top: 180,
    left: -96,
    backgroundColor: "rgba(124, 58, 237, 0.09)"
  },
  glowOrbAccent: {
    width: 210,
    height: 210,
    bottom: 54,
    right: -76,
    backgroundColor: "rgba(22, 163, 74, 0.09)"
  },
  glowOrbAccentAuth: {
    bottom: 120,
    right: -88,
    backgroundColor: "rgba(22, 163, 74, 0.08)"
  }
});
