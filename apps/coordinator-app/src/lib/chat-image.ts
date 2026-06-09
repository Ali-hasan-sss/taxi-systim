import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.72;

/** التقاط صورة من الكاميرا وضغطها قبل رفعها في الدردشة */
export async function captureCompressedChatPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    return null;
  }

  const picked = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 1,
    allowsEditing: false
  });
  if (picked.canceled || !picked.assets[0]?.uri) {
    return null;
  }

  const asset = picked.assets[0];
  const width = asset.width ?? MAX_EDGE;
  const height = asset.height ?? MAX_EDGE;
  const actions: ImageManipulator.Action[] = [];
  if (width > MAX_EDGE || height > MAX_EDGE) {
    if (width >= height) {
      actions.push({ resize: { width: MAX_EDGE } });
    } else {
      actions.push({ resize: { height: MAX_EDGE } });
    }
  }

  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG
  });
  return result.uri;
}
