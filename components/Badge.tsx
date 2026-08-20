import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

type BadgeVariant = "success" | "danger" | "info" | "amber" | "primary" | "neutral";

interface BadgeProps {
  text: string;
  variant?: BadgeVariant;
}

/**
 * §8.2 status pill. Semantic color pair per variant, tiny rounded label.
 */
const Badge = ({ text, variant = "neutral" }: BadgeProps) => {
  const isDark = useIsDark();
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  let fg: string;
  let bg: string;
  switch (variant) {
    case "success":
      fg = colors.success;
      bg = colors.successLight;
      break;
    case "danger":
      fg = colors.danger;
      bg = colors.dangerLight;
      break;
    case "info":
      fg = colors.info;
      bg = colors.infoLight;
      break;
    case "amber":
      fg = colors.amber;
      bg = `${colors.amber}1A`;
      break;
    case "primary":
      fg = colors.primary;
      bg = isDark ? colors.primaryLightDark : colors.primaryLight;
      break;
    case "neutral":
    default:
      fg = textSecondary;
      bg = isDark ? colors.surfaceElevatedDark : colors.gray100;
      break;
  }

  return (
    <View
      style={[styles.pill, { backgroundColor: bg, borderColor: bg }]}
      accessibilityRole="text"
      accessibilityLabel={text}
    >
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});

export default Badge;
