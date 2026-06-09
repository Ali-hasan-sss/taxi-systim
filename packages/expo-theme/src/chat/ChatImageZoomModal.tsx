import { Image, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";

type Props = {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
  backdropColor?: string;
};

/** عرض صورة بحجم كامل مع تكبير/تصغير عبر ScrollView (بدون reanimated — متوافق مع Expo Go) */
export function ChatImageZoomModal({ uri, visible, onClose, backdropColor = "rgba(0,0,0,0.92)" }: Props) {
  const { width, height } = useWindowDimensions();

  if (!uri) return null;

  const imageW = width * 0.92;
  const imageH = height * 0.72;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: backdropColor }]}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.centered}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          bouncesZoom
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Image source={{ uri }} style={{ width: imageW, height: imageH }} resizeMode="contain" />
        </ScrollView>
        <Pressable style={styles.closeHit} onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق">
          <View style={styles.closeDot} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  centered: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  closeHit: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  closeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.85)"
  }
});
