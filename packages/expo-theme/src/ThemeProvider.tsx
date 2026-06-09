import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useColorScheme } from "react-native";
import { StyleSheet } from "react-native";
import { type AppAccent, type AppTheme, type ThemeMode, buildTheme } from "./colors";

const STORAGE_PREFIX = "taxi_theme_mode_";

type ThemePreference = ThemeMode | "system";

interface ThemeContextValue {
  theme: AppTheme;
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveMode(preference: ThemePreference, systemScheme: ThemeMode | null | undefined): ThemeMode {
  if (preference === "system") {
    return systemScheme === "dark" ? "dark" : "light";
  }
  return preference;
}

export function ThemeProvider({
  accent,
  children
}: {
  accent: AppAccent;
  children: ReactNode;
}) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(`${STORAGE_PREFIX}${accent}`).then((raw) => {
      if (cancelled) return;
      if (raw === "light" || raw === "dark" || raw === "system") {
        setPreferenceState(raw);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accent]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      void AsyncStorage.setItem(`${STORAGE_PREFIX}${accent}`, next);
    },
    [accent]
  );

  const mode = resolveMode(preference, systemScheme === "dark" ? "dark" : "light");
  const theme = useMemo(() => buildTheme(mode, accent), [mode, accent]);

  const toggleMode = useCallback(() => {
    const next: ThemeMode = mode === "light" ? "dark" : "light";
    setPreference(next);
  }, [mode, setPreference]);

  const value = useMemo(
    () => ({
      theme,
      mode,
      preference,
      setPreference,
      toggleMode
    }),
    [theme, mode, preference, setPreference, toggleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: AppTheme) => T): T {
  const { theme } = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
}
