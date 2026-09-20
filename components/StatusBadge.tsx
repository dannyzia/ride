import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors } from "@/theme/goRide";

type BadgeStatus = "completed" | "cancelled" | "in_progress" | "scheduled";

interface StatusBadgeProps {
  status: BadgeStatus;
  size?: "sm" | "md";
}

// labelKey, not a literal label — the badge renders in every locale.
const STATUS_CONFIG: Record<BadgeStatus, { bg: string; text: string; labelKey: string }> = {
  completed: { bg: colors.primaryLight, text: colors.primary, labelKey: "activity.completed" },
  cancelled: { bg: colors.dangerLight, text: colors.danger, labelKey: "activity.cancelled" },
  in_progress: { bg: `${colors.amber}1A`, text: colors.amber, labelKey: "rides_list.status_in_progress" },
  scheduled: { bg: `${colors.blue}1A`, text: colors.blue, labelKey: "rides_list.filter_scheduled" },
};

const StatusBadge = ({ status, size = "md" }: StatusBadgeProps) => {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status];
  const label = t(config.labelKey);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.badge, { backgroundColor: config.bg }]}
    >
      <Text style={[size === "sm" ? styles.textSm : styles.textMd, { color: config.text }]}>
        {label}
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
