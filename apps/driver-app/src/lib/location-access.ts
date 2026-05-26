import * as Location from "expo-location";
import { Linking, Platform } from "react-native";

export type DriverLocationAccessState = {
  permissionGranted: boolean;
  servicesEnabled: boolean;
};

export function isDriverLocationReady(state: DriverLocationAccessState): boolean {
  return state.permissionGranted && state.servicesEnabled;
}

export async function getDriverLocationAccessState(): Promise<DriverLocationAccessState> {
  const permission = await Location.getForegroundPermissionsAsync();
  let servicesEnabled = false;
  try {
    servicesEnabled = await Location.hasServicesEnabledAsync();
  } catch {
    servicesEnabled = false;
  }
  return {
    permissionGranted: permission.status === Location.PermissionStatus.GRANTED,
    servicesEnabled
  };
}

export async function requestDriverLocationAccess(): Promise<DriverLocationAccessState> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    permission = await Location.requestForegroundPermissionsAsync();
  }

  let servicesEnabled = false;
  try {
    servicesEnabled = await Location.hasServicesEnabledAsync();
  } catch {
    servicesEnabled = false;
  }

  if (
    Platform.OS === "android" &&
    permission.status === Location.PermissionStatus.GRANTED &&
    !servicesEnabled &&
    typeof Location.enableNetworkProviderAsync === "function"
  ) {
    try {
      await Location.enableNetworkProviderAsync();
      servicesEnabled = await Location.hasServicesEnabledAsync();
    } catch {
      /* ignored */
    }
  }

  return {
    permissionGranted: permission.status === Location.PermissionStatus.GRANTED,
    servicesEnabled
  };
}

export async function openDriverAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    /* ignored */
  }
}
