/**
 * تفعيل RTL قبل تحميل expo-router (نفس منطق تطبيق المنسق).
 */
const { I18nManager, Platform } = require("react-native");

I18nManager.allowRTL(true);
if (Platform.OS !== "web") {
  I18nManager.forceRTL(true);
}

require("expo-router/entry");
