import { Text, View, type ImageSourcePropType } from "react-native";
import { AppBrandLogo } from "./AppBrandLogo";

/** لوجو واسم التطبيق في الشريط العلوي — لا يُعرض شيء قبل جاهزية الهوية. */
export function AppBrandMark({
  ready,
  logoSource,
  appName,
  height = 42,
  nameColor,
  accessibilityLabel
}: {
  ready: boolean;
  logoSource: ImageSourcePropType | null;
  appName: string;
  height?: number;
  nameColor: string;
  accessibilityLabel?: string;
}) {
  if (!ready) {
    return <View style={{ height, minWidth: 96 }} />;
  }

  const name = appName.trim();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
        flexShrink: 1,
        maxWidth: 220
      }}
    >
      {logoSource ? (
        <AppBrandLogo source={logoSource} height={height} accessibilityLabel={accessibilityLabel || name || "لوجو المنصة"} />
      ) : null}
      {name ? (
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 1,
            minWidth: 0,
            fontSize: 16,
            fontWeight: "800",
            color: nameColor,
            writingDirection: "rtl"
          }}
        >
          {name}
        </Text>
      ) : null}
    </View>
  );
}
