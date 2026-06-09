/** يطابق tabBarStyle.height في app/(tabs)/_layout.tsx */
export function coordinatorTabBarOuterHeight(bottomSafeInset: number): number {
  return 68 + Math.max(bottomSafeInset, 8);
}
