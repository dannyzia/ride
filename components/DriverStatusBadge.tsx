import { View, Text } from "react-native";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface DriverStatusBadgeProps {
  status: string;
}

export default function DriverStatusBadge({ status }: DriverStatusBadgeProps) {
  const isDark = useIsDark();

  const s = status.toLowerCase();

  const getColors = () => {
    switch (s) {
      case "active":
        return { bg: colors.greenVariant, text: colors.white };
      case "pending":
        return { bg: colors.amber, text: colors.white };
      case "suspended":
        return { bg: colors.danger, text: colors.white };
      case "rejected":
        return { bg: colors.danger, text: colors.white };
      case "inactive":
      default:
        return {
          bg: isDark ? colors.borderDark : colors.gray200,
          text: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
        };
    }
  };

  const getLabel = () => {
    switch (s) {
      case "active": return "Active";
      case "pending": return "Pending";
      case "suspended": return "Suspended";
      case "rejected": return "Rejected";
      case "inactive": return "Inactive";
      default: return s.charAt(0).toUpperCase() + s.slice(1);
    }
  };

  const style = getColors();

  return (
    <View
      className="px-3 py-1 rounded-full"
      style={{ backgroundColor: style.bg }}
    >
      <Text
        className="text-xs font-JakartaSemiBold"
        style={{ color: style.text }}
      >
        {getLabel()}
      </Text>
    </View>
  );
}
