import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface RideInfoCardProps {
  origin: string;
  destination: string;
  stop_count?: number;
}

export default function RideInfoCard({
  origin,
  destination,
  stop_count,
}: RideInfoCardProps) {
  const isDark = useIsDark();

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark
    ? colors.textPrimaryDark
    : colors.textPrimaryLight;

  return (
    <View
      style={{
        backgroundColor: surfaceBg,
        borderWidth: 1,
        borderColor: borderColor,
        borderRadius: radii.lg,
        padding: spacing.lg,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
        }}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: colors.primary,
          }}
        />
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontSize: 16,
            color: textPrimary,
            flexShrink: 1,
          }}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {origin}
        </Text>
        {stop_count != null && stop_count > 0 && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
              borderRadius: radii.pill,
              backgroundColor: colors.primaryLight,
              borderWidth: 1,
              borderColor: colors.primary + "30",
              alignSelf: "flex-start",
            }}
          >
            <Ionicons
              name="ellipse-outline"
              size={11}
              color={colors.accent}
            />
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 11,
                color: colors.accent,
              }}
            >
              +{stop_count} stops
            </Text>
          </View>
        )}
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: borderColor,
          marginVertical: spacing.md,
          marginLeft: 22,
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
        }}
      >
        <Ionicons name="location" size={16} color={colors.danger} />
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontSize: 16,
            color: textPrimary,
            flexShrink: 1,
          }}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {destination}
        </Text>
      </View>
    </View>
  );
}
