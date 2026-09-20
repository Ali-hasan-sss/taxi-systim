import { SkeletonBone, SkeletonGroup, useTheme, useThemedStyles } from "@taxi/expo-theme";
import { View } from "react-native";

function OrderCardSkeleton({ compact }: { compact?: boolean }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceCard,
        borderRadius: compact ? 12 : 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: compact ? 12 : 16,
        marginBottom: compact ? 8 : 12
      }}
    >
      {compact ? (
        <>
          <SkeletonBone width="88%" height={14} />
          <SkeletonBone width="72%" height={12} style={{ marginTop: 8 }} />
          <SkeletonBone width="36%" height={12} style={{ marginTop: 8 }} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 12 }}>
            <SkeletonBone width={86} height={22} radius={8} />
            <SkeletonBone width={64} height={22} radius={8} />
          </View>
          <View
            style={{
              backgroundColor: theme.colors.infoBg,
              borderRadius: 12,
              padding: 12,
              marginBottom: 10
            }}
          >
            <SkeletonBone width={48} height={10} />
            <SkeletonBone width="92%" height={14} style={{ marginTop: 8 }} />
          </View>
          <View
            style={{
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: 12,
              padding: 12,
              marginBottom: 10
            }}
          >
            <SkeletonBone width={40} height={10} />
            <SkeletonBone width="78%" height={14} style={{ marginTop: 8 }} />
          </View>
          <SkeletonBone width="40%" height={14} />
        </>
      )}
    </View>
  );
}

export function DriverHomeSkeleton() {
  const styles = useThemedStyles((t) => ({
    grid: {
      flexDirection: "row-reverse" as const,
      flexWrap: "wrap" as const,
      gap: 12,
      justifyContent: "space-between" as const
    },
    owed: {
      width: "100%" as const,
      borderRadius: 20,
      padding: 20,
      borderWidth: 2,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceCard,
      alignItems: "flex-end" as const
    },
    stat: {
      width: "48%" as const,
      backgroundColor: t.colors.surfaceCard,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: "flex-end" as const
    },
    statWide: {
      width: "100%" as const,
      backgroundColor: t.colors.surfaceCard,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: "flex-end" as const
    }
  }));

  return (
    <SkeletonGroup>
      <View style={styles.grid}>
        <View style={styles.owed}>
          <SkeletonBone width={140} height={14} />
          <SkeletonBone width={120} height={32} radius={10} style={{ marginTop: 12 }} />
          <SkeletonBone width="86%" height={12} style={{ marginTop: 12 }} />
          <SkeletonBone width="70%" height={12} style={{ marginTop: 8 }} />
        </View>
        <View style={styles.stat}>
          <SkeletonBone width={88} height={26} />
          <SkeletonBone width={110} height={12} style={{ marginTop: 10 }} />
          <SkeletonBone width={90} height={10} style={{ marginTop: 8 }} />
        </View>
        <View style={styles.stat}>
          <SkeletonBone width={88} height={26} />
          <SkeletonBone width={110} height={12} style={{ marginTop: 10 }} />
          <SkeletonBone width={90} height={10} style={{ marginTop: 8 }} />
        </View>
        <View style={styles.statWide}>
          <SkeletonBone width={88} height={26} />
          <SkeletonBone width={130} height={12} style={{ marginTop: 10 }} />
          <SkeletonBone width={100} height={10} style={{ marginTop: 8 }} />
        </View>
      </View>
    </SkeletonGroup>
  );
}

export function DriverOrdersSkeleton() {
  return (
    <SkeletonGroup style={{ paddingHorizontal: 20, paddingTop: 8 }}>
      <OrderCardSkeleton />
      <OrderCardSkeleton compact />
      <OrderCardSkeleton compact />
      <OrderCardSkeleton compact />
    </SkeletonGroup>
  );
}

export function DriverChatListSkeleton() {
  const { theme } = useTheme();
  return (
    <SkeletonGroup style={{ paddingTop: 4 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          style={{
            marginHorizontal: 16,
            marginBottom: 10,
            padding: 14,
            borderRadius: 14,
            backgroundColor: theme.colors.surfaceCard,
            borderWidth: 1,
            borderColor: theme.colors.border,
            flexDirection: "row-reverse",
            alignItems: "center",
            gap: 12
          }}
        >
          <SkeletonBone width={46} height={46} radius={23} />
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <SkeletonBone width="62%" height={14} />
            <SkeletonBone width="84%" height={11} style={{ marginTop: 8 }} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

export function DriverChatThreadSkeleton() {
  const { theme } = useTheme();
  const bubbles = [
    { mine: false, w: "68%" as const },
    { mine: true, w: "54%" as const },
    { mine: false, w: "74%" as const },
    { mine: true, w: "42%" as const },
    { mine: false, w: "60%" as const }
  ];
  return (
    <SkeletonGroup style={{ paddingHorizontal: 14, paddingVertical: 12, flex: 1 }}>
      {bubbles.map((b, i) => (
        <View
          key={i}
          style={{
            alignSelf: b.mine ? "flex-start" : "flex-end",
            width: b.w,
            backgroundColor: b.mine ? theme.colors.primary : theme.colors.surfaceCard,
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 10,
            opacity: b.mine ? 0.55 : 1
          }}
        >
          <SkeletonBone width="90%" height={12} />
          <SkeletonBone width="62%" height={12} style={{ marginTop: 8 }} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

export function DriverReportsSkeleton() {
  const { theme } = useTheme();
  return (
    <SkeletonGroup style={{ paddingHorizontal: 20, paddingTop: 8 }}>
      <SkeletonBone width={120} height={24} radius={8} style={{ marginBottom: 14, alignSelf: "flex-end" }} />
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 18,
          padding: 16,
          marginBottom: 16,
          alignItems: "flex-end"
        }}
      >
        <SkeletonBone width={110} height={14} />
        <SkeletonBone width="92%" height={11} style={{ marginTop: 10 }} />
        <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 14 }}>
          <SkeletonBone width={72} height={32} radius={10} />
          <SkeletonBone width={72} height={32} radius={10} />
          <SkeletonBone width={72} height={32} radius={10} />
        </View>
        <SkeletonBone width="100%" height={44} radius={12} style={{ marginTop: 14 }} />
      </View>
      <OrderCardSkeleton />
      <OrderCardSkeleton />
      <OrderCardSkeleton />
    </SkeletonGroup>
  );
}

export function DriverArchiveSkeleton() {
  return (
    <SkeletonGroup>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
        <SkeletonBone width={90} height={24} radius={8} style={{ marginBottom: 12, alignSelf: "flex-end" }} />
        <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <SkeletonBone width={78} height={34} radius={10} />
          <SkeletonBone width={78} height={34} radius={10} />
          <SkeletonBone width={88} height={34} radius={10} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <OrderCardSkeleton />
        <OrderCardSkeleton />
        <OrderCardSkeleton />
      </View>
    </SkeletonGroup>
  );
}

export function DriverLedgerSkeleton() {
  const { theme } = useTheme();
  return (
    <SkeletonGroup>
      <View style={{ flexDirection: "row-reverse", gap: 10, marginBottom: 12 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: theme.colors.surfaceCard,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 12,
              alignItems: "flex-end"
            }}
          >
            <SkeletonBone width="70%" height={10} />
            <SkeletonBone width="50%" height={16} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>
      {Array.from({ length: 4 }).map((_, i) => (
        <View
          key={i}
          style={{
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            alignItems: "flex-end"
          }}
        >
          <SkeletonBone width={96} height={16} />
          <SkeletonBone width="78%" height={12} style={{ marginTop: 8 }} />
          <SkeletonBone width={120} height={10} style={{ marginTop: 8 }} />
        </View>
      ))}
    </SkeletonGroup>
  );
}
