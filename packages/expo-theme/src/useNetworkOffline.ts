import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

function isDeviceOffline(state: NetInfoState): boolean {
  if (state.isConnected === false) return true;
  if (state.isInternetReachable === false) return true;
  return false;
}

/** true عندما الجهاز غير متصل بالشبكة أو لا يصل للإنترنت */
export function useNetworkOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const apply = (state: NetInfoState) => {
      setOffline(isDeviceOffline(state));
    };

    const unsubscribe = NetInfo.addEventListener(apply);
    void NetInfo.fetch().then(apply);

    return unsubscribe;
  }, []);

  return offline;
}
