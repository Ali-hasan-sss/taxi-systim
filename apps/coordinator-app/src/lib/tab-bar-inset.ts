/** يطابق tabBarStyle.height في app/(tabs)/_layout.tsx */
export function coordinatorTabBarOuterHeight(bottomSafeInset: number): number {
  return 68 + Math.max(bottomSafeInset, 8);
}

/** يطابق ارتفاع CoordinatorAppHeader مع padding الشريط العلوي */
export function coordinatorHeaderOuterHeight(topSafeInset: number): number {
  const paddingTop = Math.max(topSafeInset, 12) + 8;
  return paddingTop + 44 + 10;
}
