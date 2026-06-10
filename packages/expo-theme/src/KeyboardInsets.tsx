import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  View,
  useWindowDimensions,
  type KeyboardAvoidingViewProps,
  type StyleProp,
  type ViewStyle
} from "react-native";

/** نسبة تصغير النافذة التي نعتبرها adjustResize ناجحاً */
const RESIZE_HANDLED_RATIO = 0.45;

type InsetOptions = {
  /** true = لا رفع يدوي — اعتمد android:windowSoftInputMode=adjustResize (app.json: softwareKeyboardLayoutMode: resize) */
  disabled?: boolean;
};

/**
 * رفع يدوي فقط إذا adjustResize لم يقلّص النافذة (edge-to-edge).
 * يستخدم endCoordinates.height فقط — بدون screenY لتجنّب اختلاف أنظمة الإحداثيات.
 */
function measureManualInset(
  keyboardHeight: number,
  baselineWindowHeight: number,
  currentWindowHeight: number
): number {
  const resizedBy = Math.max(0, baselineWindowHeight - currentWindowHeight);
  if (resizedBy >= keyboardHeight * RESIZE_HANDLED_RATIO) return 0;
  return keyboardHeight;
}

/** ارتفاع إضافي فوق الكيبورد — أندرويد فقط، مع إعادة حساب عند تغيّر ارتفاع النافذة. */
export function useKeyboardBottomInset(options?: InsetOptions): number {
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const baselineRef = useRef(Dimensions.get("window").height);

  useEffect(() => {
    if (Platform.OS !== "android" || options?.disabled) return;

    const onShow = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const onHide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
      baselineRef.current = Dimensions.get("window").height;
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [options?.disabled]);

  if (Platform.OS !== "android" || options?.disabled || keyboardHeight === 0) {
    return 0;
  }

  return measureManualInset(keyboardHeight, baselineRef.current, windowHeight);
}

/** غلاف شفاف — لا يحتاج native modules (متوافق مع Expo Go). */
export function KeyboardInsetsProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

type AppKeyboardAvoidingViewProps = KeyboardAvoidingViewProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * أندرويد: true = اعتمد adjustResize فقط (الافتراضي).
   * false = fallback يدوي فقط إذا لم يقلّص النظام النافذة.
   */
  trustSystemResize?: boolean;
};

/**
 * iOS: KeyboardAvoidingView الافتراضي.
 * Android: adjustResize (softwareKeyboardLayoutMode: resize) — بدون padding يدوي افتراضياً.
 */
export function KeyboardAvoidingView({
  children,
  style,
  behavior = "padding",
  keyboardVerticalOffset = 0,
  trustSystemResize = Platform.OS === "android",
  ...rest
}: AppKeyboardAvoidingViewProps) {
  const keyboardInset = useKeyboardBottomInset({
    disabled: Platform.OS === "android" && trustSystemResize
  });

  if (Platform.OS === "android") {
    return (
      <View style={[style, keyboardInset > 0 ? { paddingBottom: keyboardInset } : null]}>
        {children}
      </View>
    );
  }

  return (
    <RNKeyboardAvoidingView
      style={style}
      behavior={behavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
      {...rest}
    >
      {children}
    </RNKeyboardAvoidingView>
  );
}

type KeyboardStickyViewProps = {
  children: ReactNode;
  offset?: { closed?: number; opened?: number };
  style?: StyleProp<ViewStyle>;
};

/** @deprecated مع adjustResize — غلاف عادي بدون margin إضافي لتجنّب رفع مزدوج. */
export function KeyboardStickyView({ children, style }: KeyboardStickyViewProps) {
  return <View style={style}>{children}</View>;
}

/** هل الكيبورد مفتوح — لضبط padding السفلي (safe area) في شريط المحادثة. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return open;
}
