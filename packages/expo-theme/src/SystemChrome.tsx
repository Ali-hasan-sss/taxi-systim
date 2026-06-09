import * as NavigationBar from "expo-navigation-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useTheme } from "./ThemeProvider";

async function applyAndroidSystemChrome(
  background: string,
  buttonStyle: "light" | "dark",
  navStyle: "light" | "dark"
) {
  try {
    await SystemUI.setBackgroundColorAsync(background);
  } catch {
    /* غير متاح في بعض بيئات التشغيل */
  }
  try {
    await NavigationBar.setButtonStyleAsync(buttonStyle);
  } catch {
    /* Expo Go قد لا يدعم كل واجهات شريط التنقل */
  }
  try {
    await NavigationBar.setBackgroundColorAsync(background);
  } catch {
    /* يُتجاهل عند edge-to-edge */
  }
  try {
    await NavigationBar.setBorderColorAsync(background);
  } catch {
    /* يُتجاهل عند edge-to-edge */
  }
  try {
    NavigationBar.setStyle(navStyle);
  } catch {
    /* setStyle يتطلّب native module — متاح في APK وليس دائماً في Expo Go */
  }
}

/** يطابق شريط التنقل السفلي (Android) وخلفية النظام مع ثيم التطبيق. */
export function SystemChrome() {
  const { theme, mode } = useTheme();

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const background = theme.colors.background;
    const buttonStyle = theme.statusBar === "dark" ? "dark" : "light";
    const navStyle = mode === "light" ? "light" : "dark";

    void applyAndroidSystemChrome(background, buttonStyle, navStyle);
  }, [theme.colors.background, theme.statusBar, mode]);

  return null;
}
