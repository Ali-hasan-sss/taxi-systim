export type ThemeMode = "light" | "dark";
export type AppAccent = "driver" | "coordinator";

export interface AppColors {
  background: string;
  backgroundAuth: string;
  surface: string;
  surfaceGlass: string;
  surfaceCard: string;
  surfaceMuted: string;
  surfaceInset: string;
  surfaceHeader: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  textSubtle: string;
  textInverse: string;

  border: string;
  borderStrong: string;

  primary: string;
  primaryDark: string;
  accent: string;
  accentSoft: string;
  link: string;

  success: string;
  successBg: string;
  successText: string;
  danger: string;
  dangerBg: string;
  dangerText: string;
  warning: string;
  warningBg: string;
  warningText: string;
  info: string;
  infoBg: string;
  infoText: string;

  tabBar: string;
  tabBarBorder: string;
  tabActive: string;
  tabInactive: string;

  shadow: string;
  overlay: string;
  overlayLight: string;

  inputBg: string;
  inputBorder: string;
  placeholder: string;

  menuBg: string;
  menuBorder: string;
  menuText: string;
  menuTextSecondary: string;
  menuTextMuted: string;
  menuDivider: string;

  logoBoxBg: string;
  logoBoxBorder: string;

  statHeroBg: string;
  statHeroText: string;
  statHeroSubtext: string;
  statHeroBorder: string;

  chipBg: string;
  chipText: string;
  chipActiveBg: string;
  chipActiveBorder: string;
  chipActiveText: string;

  badge: string;
  badgeBorder: string;
  badgeText: string;

  glowPrimary: string;
  glowSecondary: string;
  glowAccent: string;
  glowWash: string;

  buttonSecondaryBg: string;
  buttonSecondaryText: string;
  buttonDisabledBg: string;

  filterBg: string;
  filterBorder: string;
  filterActiveBg: string;
  filterActiveBorder: string;
  filterText: string;
  filterActiveText: string;

  modalBg: string;
  modalBorder: string;

  online: string;
  offline: string;
  busy: string;

  whatsapp: string;
  navigate: string;
  copy: string;
}

export interface AppTheme {
  mode: ThemeMode;
  accent: AppAccent;
  colors: AppColors;
  statusBar: "light" | "dark";
}

function accentColors(_accent: AppAccent, mode: ThemeMode) {
  return {
    accent: mode === "dark" ? "#fbbf24" : "#b45309",
    accentSoft: mode === "dark" ? "#78350f55" : "#fef3c7",
    link: mode === "dark" ? "#fb923c" : "#ea580c",
    tabActive: mode === "dark" ? "#fb923c" : "#ea580c",
    info: mode === "dark" ? "#fbbf24" : "#d97706",
    infoBg: mode === "dark" ? "#78350f" : "#fffbeb",
    infoText: mode === "dark" ? "#fde68a" : "#92400e",
    chipActiveBorder: mode === "dark" ? "#fb923c" : "#ea580c",
    chipActiveText: mode === "dark" ? "#fb923c" : "#ea580c",
    filterActiveBorder: mode === "dark" ? "#fb923c" : "#ea580c"
  };
}

export function buildTheme(mode: ThemeMode, accent: AppAccent): AppTheme {
  const accentTokens = accentColors(accent, mode);
  const isWarmBrand = accent === "coordinator" || accent === "driver";

  if (mode === "light") {
    return {
      mode,
      accent,
      statusBar: "dark",
      colors: {
        background: isWarmBrand ? "#fffbeb" : "#edf4ff",
        backgroundAuth: isWarmBrand ? "#fff7ed" : "#f3f7ff",
        surface: "#ffffff",
        surfaceGlass: "rgba(255,255,255,0.94)",
        surfaceCard: "rgba(255,255,255,0.96)",
        surfaceMuted: isWarmBrand ? "#fef3c7" : "#f8fafc",
        surfaceInset: isWarmBrand ? "#fffbeb" : "#f8fbff",
        surfaceHeader: "#ffffff",

        text: "#0f172a",
        textSecondary: "#334155",
        textMuted: isWarmBrand ? "#78716c" : "#64748b",
        textSubtle: isWarmBrand ? "#57534e" : "#475569",
        textInverse: "#ffffff",

        border: isWarmBrand ? "#fde68a" : "#dbe4f0",
        borderStrong: isWarmBrand ? "#fcd34d" : "#cbd5e1",

        primary: isWarmBrand ? "#ea580c" : "#2563eb",
        primaryDark: isWarmBrand ? "#c2410c" : "#1d4ed8",
        accent: accentTokens.accent,
        accentSoft: accentTokens.accentSoft,
        link: accentTokens.link,

        success: "#15803d",
        successBg: "#dcfce7",
        successText: "#166534",
        danger: "#dc2626",
        dangerBg: "#fee2e2",
        dangerText: "#991b1b",
        warning: "#b45309",
        warningBg: "#fef3c7",
        warningText: "#92400e",
        info: accentTokens.info,
        infoBg: accentTokens.infoBg,
        infoText: accentTokens.infoText,

        tabBar: "#ffffff",
        tabBarBorder: isWarmBrand ? "#fde68a" : "#dbe4f0",
        tabActive: accentTokens.tabActive,
        tabInactive: isWarmBrand ? "#78716c" : "#64748b",

        shadow: "#0f172a",
        overlay: "rgba(15, 23, 42, 0.35)",
        overlayLight: "rgba(15, 23, 42, 0.28)",

        inputBg: isWarmBrand ? "#fffbeb" : "#f8fafc",
        inputBorder: isWarmBrand ? "#fcd34d" : "#cbd5e1",
        placeholder: isWarmBrand ? "#78716c" : "#64748b",

        menuBg: isWarmBrand ? "#fffbeb" : "#ffffff",
        menuBorder: isWarmBrand ? "#fde68a" : "#dbe4f0",
        menuText: "#0f172a",
        menuTextSecondary: isWarmBrand ? "#78716c" : "#64748b",
        menuTextMuted: isWarmBrand ? "#57534e" : "#475569",
        menuDivider: isWarmBrand ? "#fde68a" : "#dbe4f0",

        logoBoxBg: isWarmBrand ? "#fef3c7" : "#f8fafc",
        logoBoxBorder: isWarmBrand ? "#fcd34d" : "#e2e8f0",

        statHeroBg: isWarmBrand ? "#78350f" : "#1e293b",
        statHeroText: "#f8fafc",
        statHeroSubtext: "#fde68a",
        statHeroBorder: isWarmBrand ? "#92400e" : "#334155",

        chipBg: isWarmBrand ? "#fde68a" : "#e2e8f0",
        chipText: isWarmBrand ? "#78350f" : "#475569",
        chipActiveBg: isWarmBrand ? "#ea580c" : "#2563eb",
        chipActiveBorder: accentTokens.chipActiveBorder,
        chipActiveText: "#ffffff",

        badge: "#dc2626",
        badgeBorder: "#ffffff",
        badgeText: "#ffffff",

        glowPrimary: isWarmBrand ? "rgba(234, 88, 12, 0.18)" : "rgba(37, 99, 235, 0.16)",
        glowSecondary: isWarmBrand ? "rgba(202, 138, 4, 0.12)" : "rgba(124, 58, 237, 0.09)",
        glowAccent: "rgba(22, 163, 74, 0.09)",
        glowWash: "rgba(255,255,255,0.35)",

        buttonSecondaryBg: isWarmBrand ? "#fde68a" : "#e2e8f0",
        buttonSecondaryText: isWarmBrand ? "#78350f" : "#334155",
        buttonDisabledBg: isWarmBrand ? "#fde68a" : "#e2e8f0",

        filterBg: isWarmBrand ? "#fef3c7" : "#e2e8f0",
        filterBorder: isWarmBrand ? "#fcd34d" : "#cbd5e1",
        filterActiveBg: isWarmBrand ? "#ea580c" : "#2563eb",
        filterActiveBorder: accentTokens.filterActiveBorder,
        filterText: "#475569",
        filterActiveText: "#ffffff",

        modalBg: "#ffffff",
        modalBorder: isWarmBrand ? "#fde68a" : "#dbe4f0",

        online: "#22c55e",
        offline: "#ef4444",
        busy: "#ea580c",

        whatsapp: "#15803d",
        navigate: "#0f766e",
        copy: isWarmBrand ? "#ea580c" : "#2563eb"
      }
    };
  }

  return {
    mode,
    accent,
    statusBar: "light",
    colors: {
      background: isWarmBrand ? "#1c1917" : "#0f172a",
      backgroundAuth: isWarmBrand ? "#1c1917" : "#0f172a",
      surface: isWarmBrand ? "#292524" : "#1e293b",
      surfaceGlass: isWarmBrand ? "#292524" : "#1e293b",
      surfaceCard: isWarmBrand ? "#292524" : "#1e293b",
      surfaceMuted: isWarmBrand ? "#1c1917" : "#111827",
      surfaceInset: isWarmBrand ? "#1c1917" : "#0f172a",
      surfaceHeader: isWarmBrand ? "#0c0a09" : "#020617",

        text: "#f8fafc",
        textSecondary: "#e2e8f0",
        textMuted: isWarmBrand ? "#a8a29e" : "#94a3b8",
        textSubtle: isWarmBrand ? "#d6d3d1" : "#cbd5e1",
        textInverse: "#ffffff",

        border: isWarmBrand ? "#44403c" : "#334155",
        borderStrong: isWarmBrand ? "#57534e" : "#475569",

        primary: isWarmBrand ? "#f97316" : "#2563eb",
        primaryDark: isWarmBrand ? "#ea580c" : "#1d4ed8",
      accent: accentTokens.accent,
      accentSoft: accentTokens.accentSoft,
      link: accentTokens.link,

      success: "#22c55e",
      successBg: "#14532d",
      successText: "#f0fdf4",
      danger: "#ef4444",
      dangerBg: "#7f1d1d",
      dangerText: "#fecaca",
      warning: "#f59e0b",
      warningBg: "#78350f",
      warningText: "#fde68a",
      info: accentTokens.info,
      infoBg: accentTokens.infoBg,
      infoText: accentTokens.infoText,

        tabBar: isWarmBrand ? "#1c1917" : "#0f172a",
        tabBarBorder: isWarmBrand ? "#44403c" : "#1e293b",
        tabActive: accentTokens.tabActive,
        tabInactive: isWarmBrand ? "#a8a29e" : "#64748b",

        shadow: "#000000",
        overlay: "rgba(0,0,0,0.55)",
        overlayLight: "rgba(15, 23, 42, 0.82)",

        inputBg: isWarmBrand ? "#1c1917" : "#0f172a",
        inputBorder: isWarmBrand ? "#57534e" : "#334155",
        placeholder: isWarmBrand ? "#a8a29e" : "#64748b",

        menuBg: isWarmBrand ? "#1c1917" : "#1e293b",
        menuBorder: isWarmBrand ? "#44403c" : "#334155",
        menuText: "#f8fafc",
        menuTextSecondary: isWarmBrand ? "#a8a29e" : "#94a3b8",
        menuTextMuted: isWarmBrand ? "#d6d3d1" : "#cbd5e1",
        menuDivider: isWarmBrand ? "#44403c" : "#334155",

        logoBoxBg: isWarmBrand ? "#292524" : "#1e293b",
        logoBoxBorder: isWarmBrand ? "#57534e" : "#475569",

        statHeroBg: isWarmBrand ? "#78350f" : "#1e293b",
        statHeroText: "#f8fafc",
        statHeroSubtext: "#fde68a",
        statHeroBorder: isWarmBrand ? "#92400e" : "#334155",

        chipBg: isWarmBrand ? "#44403c" : "#334155",
        chipText: isWarmBrand ? "#fde68a" : "#cbd5e1",
        chipActiveBg: isWarmBrand ? "#ea580c" : "#2563eb",
      chipActiveBorder: accentTokens.chipActiveBorder,
      chipActiveText: "#ffffff",

      badge: "#dc2626",
      badgeBorder: isWarmBrand ? "#1c1917" : "#0f172a",
      badgeText: "#ffffff",

        glowPrimary: isWarmBrand ? "rgba(251, 146, 60, 0.14)" : "rgba(56, 189, 248, 0.12)",
        glowSecondary: isWarmBrand ? "rgba(251, 191, 36, 0.1)" : "rgba(124, 58, 237, 0.08)",
        glowAccent: "rgba(34, 197, 94, 0.08)",
        glowWash: isWarmBrand ? "rgba(28, 25, 23, 0.45)" : "rgba(30, 41, 59, 0.45)",

        buttonSecondaryBg: isWarmBrand ? "#44403c" : "#334155",
        buttonSecondaryText: "#e2e8f0",
        buttonDisabledBg: isWarmBrand ? "#44403c" : "#334155",

        filterBg: isWarmBrand ? "#292524" : "#1e293b",
        filterBorder: isWarmBrand ? "#57534e" : "#334155",
        filterActiveBg: isWarmBrand ? "#c2410c" : "#1d4ed8",
        filterActiveBorder: isWarmBrand ? "#fb923c" : "#3b82f6",
        filterText: isWarmBrand ? "#d6d3d1" : "#94a3b8",
        filterActiveText: "#fffbeb",

        modalBg: isWarmBrand ? "#292524" : "#1e293b",
        modalBorder: isWarmBrand ? "#57534e" : "#334155",

        online: "#22c55e",
        offline: "#ef4444",
        busy: "#ea580c",

        whatsapp: "#15803d",
        navigate: "#0f766e",
        copy: isWarmBrand ? "#fb923c" : "#2563eb"
    }
  };
}

export function driverOrderStatusPill(
  status: string,
  theme: AppTheme
): { backgroundColor: string; color: string } {
  const { mode, colors } = theme;
  switch (status) {
    case "PENDING":
      return mode === "light"
        ? { backgroundColor: "#fef3c7", color: "#92400e" }
        : { backgroundColor: "#78350f", color: "#fde68a" };
    case "ASSIGNED":
    case "ACCEPTED":
      return mode === "light"
        ? { backgroundColor: "#ffedd5", color: "#9a3412" }
        : { backgroundColor: "#7c2d12", color: "#fed7aa" };
    case "EN_ROUTE":
      return mode === "light"
        ? { backgroundColor: "#dcfce7", color: "#166534" }
        : { backgroundColor: "#14532d", color: "#bbf7d0" };
    case "STUCK":
      return mode === "light"
        ? { backgroundColor: "#ffedd5", color: "#9a3412" }
        : { backgroundColor: "#7c2d12", color: "#fed7aa" };
    case "COMPLETED":
      return { backgroundColor: colors.successBg, color: colors.successText };
    case "CANCELLED":
      return { backgroundColor: colors.dangerBg, color: colors.dangerText };
    default:
      return mode === "light"
        ? { backgroundColor: "#e2e8f0", color: "#475569" }
        : { backgroundColor: "#334155", color: "#cbd5e1" };
  }
}

export function coordinatorOrderStatusPill(
  status: string,
  theme: AppTheme
): { backgroundColor: string; color: string } {
  switch (status) {
    case "PENDING":
      return { backgroundColor: "#b45309", color: "#fffbeb" };
    case "ASSIGNED":
    case "ACCEPTED":
      return { backgroundColor: "#c2410c", color: "#fff7ed" };
    case "EN_ROUTE":
      return { backgroundColor: "#15803d", color: "#f0fdf4" };
    case "STUCK":
      return { backgroundColor: "#c2410c", color: "#fff7ed" };
    case "COMPLETED":
      return { backgroundColor: "#15803d", color: "#f0fdf4" };
    case "CANCELLED":
      return { backgroundColor: "#991b1b", color: "#fee2e2" };
    default:
      return { backgroundColor: "#475569", color: "#f1f5f9" };
  }
}
