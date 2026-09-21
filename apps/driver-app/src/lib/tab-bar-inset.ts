/** يطابق tabBarStyle.height في app/(tabs)/_layout.tsx */
export function driverTabBarOuterHeight(bottomSafeInset: number): number {
  return 58 + Math.max(bottomSafeInset, 8);
}

/** يطابق ارتفاع DriverAppHeader مع padding الشريط العلوي */
export function driverHeaderOuterHeight(topSafeInset: number): number {
  const paddingTop = Math.max(topSafeInset, 12) + 8;
  return paddingTop + 44 + 10;
}
