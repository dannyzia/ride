import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState = ({
  icon,
  iconSize = 64,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) => {
  const isDark = useIsDark();
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={iconSize} color={textDisabled} />
      <Text style={[styles.title, { color: textSecondary }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: textDisabled }]}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          activeOpacity={0.8}
          style={styles.action}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
    marginTop: 16,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 8,
    maxWidth: 280,
    textAlign: "center",
  },
  action: {
    height: 48,
    minWidth: 160,
    marginTop: 24,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
    color: colors.white,
  },
});

export default EmptyState;
