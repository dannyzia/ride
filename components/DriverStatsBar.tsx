import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { formatBDT } from "@/lib/format";

interface DriverStatsBarProps {
  earnings_bdt: number;
  trips: number;
  online_hours: number;
  onPress?: () => void;
}

export default function DriverStatsBar({
  earnings_bdt,
  trips,
  online_hours,
  onPress,
}: DriverStatsBarProps) {
  const isDark = useIsDark();

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark
    ? colors.textPrimaryDark
    : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const earningsTk = formatBDT(earnings_bdt);

  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: surfaceBg,
        borderWidth: 1,
        borderColor: borderColor,
        borderRadius: radii.lg,
      }}
    >
      <Ionicons name="stats-chart" size={20} color={colors.primary} />
      <Text
        style={{
          fontFamily: "Jakarta-Bold",
          fontSize: 17,
          color: textPrimary,
          fontVariant: ["tabular-nums"],
        }}
      >
        Today: {earningsTk}
      </Text>
      <Text
        style={{
          fontFamily: "Jakarta-Regular",
          fontSize: 14,
          color: textSecondary,
          fontVariant: ["tabular-nums"],
        }}
      >
        {" • "}
      </Text>
      <Text
        style={{
          fontFamily: "Jakarta-Regular",
          fontSize: 14,
          color: textSecondary,
          fontVariant: ["tabular-nums"],
        }}
      >
        {trips} trips
      </Text>
      <Text
        style={{
          fontFamily: "Jakarta-Regular",
          fontSize: 14,
          color: textSecondary,
          fontVariant: ["tabular-nums"],
        }}
      >
        {" • "}
      </Text>
      <Text
        style={{
          fontFamily: "Jakarta-Regular",
          fontSize: 14,
          color: textSecondary,
          fontVariant: ["tabular-nums"],
        }}
      >
        {online_hours}h
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Today's earnings summary"
      accessibilityHint="Shows today's earnings, trips and online hours"
    >
      {content}
    </TouchableOpacity>
  );
}
