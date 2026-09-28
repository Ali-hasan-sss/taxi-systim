import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { FrostedFill } from "./FrostedFill";

type Props = {
  children: ReactNode;
  size?: number;
};

/** دائرة زجاجية مقصوصة بحجم الأيقونة فقط. */
export function GlassIconCircle({ children, size = 44 }: Props) {
  return (
    <View
      collapsable={false}
      style={[styles.root, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <FrostedFill intensity={52} style={{ width: size, height: size }} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center"
  }
});
