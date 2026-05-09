/** يطابق tabBarStyle.height في app/(tabs)/_layout.tsx */
export function coordinatorTabBarOuterHeight(bottomSafeInset: number): number {
  return 58 + Math.max(bottomSafeInset, 8);
}
