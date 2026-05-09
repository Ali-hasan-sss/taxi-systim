/**
 * يجب أن يُنفَّذ قبل `expo-router/entry`: استيراد ES يُعلّق تنفيذ الجسم بعد تحميل الرسم البياني
 * بالكامل، فيفوت تفعيل RTL. الترتيب هنا يضمن forceRTL قبل أي شاشة.
 */
const { I18nManager, Platform } = require("react-native");

I18nManager.allowRTL(true);
if (Platform.OS !== "web") {
  I18nManager.forceRTL(true);
}

require("expo-router/entry");
