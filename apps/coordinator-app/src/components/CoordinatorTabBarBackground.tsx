import { StyleSheet, View } from "react-native";
import { FrostedFill } from "./FrostedFill";

/** خلفية الشريط السفلي فقط — لا تمتد فوق محتوى الشاشة. */
export function CoordinatorTabBarBackground() {
  return (
    <View style={styles.root} pointerEvents="none" collapsable={false}>
      <FrostedFill intensity={64} androidOpacity={0.66} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden"
  }
});
