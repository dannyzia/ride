import { View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface DriverActionBarProps {
  onCall: () => void;
  onNavigate: () => void;
  onChat?: () => void;
}

export default function DriverActionBar({
  onCall,
  onNavigate,
  onChat,
}: DriverActionBarProps) {
  const isDark = useIsDark();

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const iconSecondary = isDark
    ? colors.textPrimaryDark
    : colors.textPrimaryLight;

  const buttonBase = {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: spacing.sm,
    height: 64,
    borderRadius: radii.lg,
  };

  return (
    <View
      style={{
        flexDirection: "row",
        gap: spacing.md,
        backgroundColor: surfaceBg,
        borderWidth: 1,
        borderColor: borderColor,
        borderRadius: radii.xl,
        padding: spacing.sm,
      }}
    >
      <TouchableOpacity
        onPress={onCall}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Call customer"
        style={{
          ...buttonBase,
          backgroundColor: colors.primary,
        }}
      >
        <Ionicons name="call" size={22} color={colors.white} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onNavigate}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Open navigation"
        style={{
          ...buttonBase,
          backgroundColor: surfaceBg,
          borderWidth: 1,
          borderColor: borderColor,
        }}
      >
        <Ionicons name="navigate" size={22} color={iconSecondary} />
      </TouchableOpacity>
      {onChat && (
        <TouchableOpacity
          onPress={onChat}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open chat"
          style={{
            ...buttonBase,
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor: borderColor,
          }}
        >
          <Ionicons name="chatbubble" size={22} color={iconSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}
