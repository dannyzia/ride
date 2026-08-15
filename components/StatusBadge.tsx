import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/goRide";

type BadgeStatus = "completed" | "cancelled" | "in_progress" | "scheduled";

interface StatusBadgeProps {
  status: BadgeStatus;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<BadgeStatus, { bg: string; text: string; label: string }> = {
  completed: { bg: colors.primaryLight, text: colors.primary, label: "Completed" },
  cancelled: { bg: colors.dangerLight, text: colors.danger, label: "Cancelled" },
  in_progress: { bg: `${colors.amber}1A`, text: colors.amber, label: "In Progress" },
  scheduled: { bg: `${colors.blue}1A`, text: colors.blue, label: "Scheduled" },
};

const StatusBadge = ({ status, size = "md" }: StatusBadgeProps) => {
  const config = STATUS_CONFIG[status];

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={config.label}
      style={[styles.badge, { backgroundColor: config.bg }]}
    >
      <Text style={[size === "sm" ? styles.textSm : styles.textMd, { color: config.text }]}>
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 100,
  },
  textSm: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
  textMd: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
});

export default StatusBadge;
