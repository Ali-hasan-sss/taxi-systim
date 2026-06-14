import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  View,
  useWindowDimensions,
  type KeyboardAvoidingViewProps,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle
} from "react-native";

/** شريط اقتراحات Gboard فوق المفاتيح — غير مضمّن في screenY على Android 13+ */
const ANDROID_KEYBOARD_TOOLBAR_GAP = 48;

type InsetOptions = {
  /** true = لا رفع يدوي — اعتمد adjustResize فقط */
  disabled?: boolean;
};

/**
 * كم يغطي الكيبورد من أسفل نافذة التطبيق.
 * يُعاد حسابه عند تغيّر window.height — فينجح adjustResize (Android ≤12) يصبح ≈0 تلقائياً.
 */
function androidKeyboardOverlap(e: KeyboardEvent, windowHeight: number): number {
  const screenHeight = Dimensions.get("screen").height;
  const windowTopOffset = Math.max(0, screenHeight - windowHeight);
  const keyboardTopInWindow = e.endCoordinates.screenY - windowTopOffset;
  let overlap = Math.max(0, windowHeight - keyboardTopInWindow);

  if (overlap <= 4) return 0;

  // Android 13+ / edge-to-edge: screenY أحياناً عند المفاتيح لا شريط الأدوات
  if (Platform.Version >= 33 && overlap < e.endCoordinates.height) {
    overlap = e.endCoordinates.height + ANDROID_KEYBOARD_TOOLBAR_GAP;
  }

  return Math.round(overlap);
}

/** ارتفاع إضافي فوق الكيبورد — أندroid فقط */
export function useKeyboardBottomInset(options?: InsetOptions): number {
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardEvent, setKeyboardEvent] = useState<KeyboardEvent | null>(null);
  const eventRef = useRef<KeyboardEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android" || options?.disabled) return;

    const onShow = Keyboard.addListener("keyboardDidShow", (e) => {
      eventRef.current = e;
      setKeyboardEvent(e);
      // adjustResize على Android ≤12 يحدّث window.height بعد keyboardDidShow
      setTimeout(() => {
        if (eventRef.current) setKeyboardEvent({ ...eventRef.current });
      }, 80);
    });
    const onHide = Keyboard.addListener("keyboardDidHide", () => {
      eventRef.current = null;
      setKeyboardEvent(null);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [options?.disabled]);

  if (Platform.OS !== "android" || options?.disabled || !keyboardEvent) {
    return 0;
  }

  return androidKeyboardOverlap(keyboardEvent, windowHeight);
}

/** غلاف شفاف — لا يحتاج native modules (متوافق مع Expo Go). */
export function KeyboardInsetsProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
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

type AppKeyboardAvoidingViewProps = KeyboardAvoidingViewProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * أندرويد: true = اعتمد adjustResize فقط (Android ≤12 عادةً).
   * false = رفع يدوي ذكي يكمّل adjustResize عند الحاجة (Android 13+).
   */
  trustSystemResize?: boolean;
  /**
   * داخل React Native Modal: على Android 13+ يرتفع المحتوى مع adjustResize —
   * الرفع اليدوي يُسبّب رفعاً مزدوجاً.
   */
  inModal?: boolean;
};

/**
 * iOS: KeyboardAvoidingView الافتراضي.
 * Android: padding يدوي ذكي — يصبح 0 تلقائياً عند نجاح adjustResize.
 */
export function KeyboardAvoidingView({
  children,
  style,
  behavior = "padding",
  keyboardVerticalOffset = 0,
  inModal = false,
  trustSystemResize = Platform.OS === "android" && (inModal || Platform.Version < 33),
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

/** @deprecated — غلاف عادي بدون margin إضافي */
export function KeyboardStickyView({ children, style }: KeyboardStickyViewProps) {
  return <View style={style}>{children}</View>;
}
