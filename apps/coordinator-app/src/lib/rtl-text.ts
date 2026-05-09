import { I18nManager, Platform, type TextStyle } from "react-native";

/**
 * مع `forceRTL` يكون `I18nManager.isRTL === true`؛ عندها `textAlign: "right"` يصبح
 * محاذاة «نهاية السطر» وتظهر بصريًا على اليسار. نستخدم «left» لمحاذاة بداية السطر (= يمين الشاشة).
 * على الويب مع `<html dir="rtl">` نفس المنطق: «left» ≈ inline-start من اليمين.
 */
export const rtlText: TextStyle = {
  textAlign: Platform.OS === "web" || I18nManager.isRTL ? "left" : "right",
  writingDirection: "rtl"
};
