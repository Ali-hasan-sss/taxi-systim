import Constants from "expo-constants";

/** Expo Go (SDK 53+) لا يدعم Expo Push على أندرويد — نتجنّب تحميل expo-notifications هناك. */
export function shouldLoadExpoPushModule(): boolean {
  return Constants.appOwnership !== "expo";
}
