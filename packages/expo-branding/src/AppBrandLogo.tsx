import { useState } from "react";
import { Image, type ImageSourcePropType } from "react-native";

const DEFAULT_RATIO = 482 / 271;

/** يعرض اللوجو بارتفاعه الطبيعي ملاصقًا لحافة صندوقه، بلا فراغ جانبي من الاحتواء. */
export function AppBrandLogo({
  source,
  height = 42,
  accessibilityLabel
}: {
  source: ImageSourcePropType;
  height?: number;
  accessibilityLabel?: string;
}) {
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const width = Math.min(190, Math.max(height, height * ratio));

  return (
    <Image
      source={source}
      accessibilityLabel={accessibilityLabel}
      resizeMode="contain"
      onLoad={(event) => {
        const nextWidth = event.nativeEvent.source?.width ?? 0;
        const nextHeight = event.nativeEvent.source?.height ?? 0;
        if (nextWidth > 0 && nextHeight > 0) {
          setRatio(nextWidth / nextHeight);
        }
      }}
      style={{ height, width, alignSelf: "flex-start" }}
    />
  );
}
