/**
 * بدون forceRTL — المحاذاة عبر direction:rtl على الشاشات؛ شريط التنقل يبقى LTR.
 */
require("react-native-gesture-handler");

const { I18nManager } = require("react-native");

I18nManager.allowRTL(true);
I18nManager.forceRTL(false);

require("expo-router/entry");
