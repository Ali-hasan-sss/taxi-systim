import Ionicons from "@expo/vector-icons/Ionicons";
import type { ChatReceiptStatus } from "@taxi/config";
import { View } from "react-native";

type Props = {
  status?: ChatReceiptStatus;
  color: string;
  readColor: string;
};

export function MessageReceipt({ status = "sent", color, readColor }: Props) {
  const iconColor = status === "read" ? readColor : color;
  if (status === "sent") {
    return <Ionicons name="checkmark" size={14} color={iconColor} />;
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginStart: -6 }}>
      <Ionicons name="checkmark" size={14} color={iconColor} style={{ marginEnd: -8 }} />
      <Ionicons name="checkmark" size={14} color={iconColor} />
    </View>
  );
}
