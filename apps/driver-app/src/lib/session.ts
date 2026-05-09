import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "driver_access_token";
const NAME_KEY = "driver_full_name";

export async function getDriverAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getDriverFullName(): Promise<string | null> {
  return AsyncStorage.getItem(NAME_KEY);
}

export async function setDriverSession(accessToken: string, fullName: string): Promise<void> {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, accessToken],
    [NAME_KEY, fullName]
  ]);
}

export async function clearDriverSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, NAME_KEY]);
}
