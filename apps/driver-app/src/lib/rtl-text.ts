import { I18nManager, Platform, type TextStyle } from "react-native";

/** نفس منطق تطبيق المنسق مع forceRTL وويب dir=rtl. */
export const rtlText: TextStyle = {
  textAlign: Platform.OS === "web" || I18nManager.isRTL ? "left" : "right",
  writingDirection: "rtl"
};
