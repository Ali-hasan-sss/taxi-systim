import type { TextStyle, ViewStyle } from "react-native";

/** محاذاة عربية للنصوص — يُستخدم مع direction:rtl على الحاويات */
export const rtlText: TextStyle = {
  textAlign: "right",
  writingDirection: "rtl"
};

export const rtlScreen: ViewStyle = {
  direction: "rtl",
  alignItems: "stretch",
  width: "100%",
  alignSelf: "stretch"
};

export const rtlRow: ViewStyle = {
  flexDirection: "row-reverse",
  alignItems: "center"
};
