import Constants from "expo-constants";

/** Expo Go (من SDK 53) لا يوفّر Expo Push على أندرويد؛ نتجنّب تحميل expo-notifications هناك. */
export function shouldLoadExpoPushModule(): boolean {
  return Constants.appOwnership !== "expo";
}
