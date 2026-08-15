import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface VerificationStepProps {
  status: "completed" | "current" | "pending";
  title: string;
  subtitle?: string;
  isLast?: boolean;
}

export default function VerificationStep({
  status,
  title,
  subtitle,
  isLast,
}: VerificationStepProps) {
  const isDark = useIsDark();

  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark
    ? colors.textPrimaryDark
    : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const icon =
    status === "completed"
      ? { name: "checkmark-circle" as const, color: colors.success }
      : status === "current"
        ? { name: "time" as const, color: colors.amber }
        : { name: "ellipse-outline" as const, color: colors.gray600 };

  const titleStyle =
    status === "current"
      ? {
          fontFamily: "Jakarta-SemiBold",
          fontSize: 15,
          color: textPrimary,
        }
      : status === "completed"
        ? {
            fontFamily: "Jakarta-Regular",
            fontSize: 15,
            color: textPrimary,
          }
        : {
            fontFamily: "Jakarta-Regular",
            fontSize: 15,
            color: textSecondary,
          };

  return (
    <View style={{ flexDirection: "row" }}>
      <View style={{ alignItems: "center", width: 28 }}>
        <Ionicons name={icon.name} size={24} color={icon.color} />
        {!isLast && (
          <View
            style={{
              width: 2,
              flex: 1,
              backgroundColor: borderColor,
              marginTop: spacing.xs,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, paddingBottom: isLast ? 0 : spacing.xl }}>
        <Text style={titleStyle}>{title}</Text>
        {subtitle != null && subtitle.length > 0 && (
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 13,
              color: textSecondary,
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
}
