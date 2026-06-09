import { Text, View } from "react-native";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`;
}

type AvatarProps = {
  name: string;
  size?: number;
  online?: boolean | null;
  backgroundColor: string;
  textColor: string;
  onlineColor: string;
  offlineColor: string;
};

export function ChatPeerAvatar({
  name,
  size = 44,
  online = null,
  backgroundColor,
  textColor,
  onlineColor,
  offlineColor
}: AvatarProps) {
  const fontSize = Math.max(12, Math.round(size * 0.34));
  const dotSize = Math.max(10, Math.round(size * 0.28));

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Text style={{ color: textColor, fontSize, fontWeight: "800" }}>{initialsFromName(name)}</Text>
      </View>
      {online !== null ? (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: online ? onlineColor : offlineColor,
            borderWidth: 2,
            borderColor: backgroundColor
          }}
        />
      ) : null}
    </View>
  );
}

type HeaderProps = {
  name: string;
  subtitle?: string | null;
  online?: boolean | null;
  avatarSize?: number;
  titleStyle: object;
  subtitleStyle: object;
  avatarBackground: string;
  avatarText: string;
  onlineColor: string;
  offlineColor: string;
};

export function ChatHeaderPeer({
  name,
  subtitle,
  online = null,
  avatarSize = 44,
  titleStyle,
  subtitleStyle,
  avatarBackground,
  avatarText,
  onlineColor,
  offlineColor
}: HeaderProps) {
  return (
    <View style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 10, minWidth: 0 }}>
      <ChatPeerAvatar
        name={name}
        size={avatarSize}
        online={online}
        backgroundColor={avatarBackground}
        textColor={avatarText}
        onlineColor={onlineColor}
        offlineColor={offlineColor}
      />
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
        <Text style={titleStyle} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={subtitleStyle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
