import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { formatRelativeTime } from "@/lib/format";

type NotificationType = "promo" | "trip" | "payment" | "system";

interface NotificationCardProps {
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  onPress?: () => void;
}

const NotificationCard = ({
  type,
  title,
  body,
  isRead,
  createdAt,
  onPress,
}: NotificationCardProps) => {
  const isDark = useIsDark();
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;

  let icon: keyof typeof Ionicons.glyphMap;
  let circleStyle: { backgroundColor?: string; borderWidth?: number; borderColor?: string };
  let iconColor: string;
  switch (type) {
    case "promo":
      icon = "gift";
      circleStyle = { backgroundColor: colors.primaryLight };
      iconColor = colors.primary;
      break;
    case "trip":
      icon = "car";
      circleStyle = { backgroundColor: colors.infoLight };
      iconColor = colors.info;
      break;
    case "payment":
      icon = "card";
      circleStyle = { backgroundColor: `${colors.checkGreen}1A` };
      iconColor = colors.checkGreen;
      break;
    case "system":
    default:
      icon = "information-circle";
      circleStyle = { borderWidth: 1, borderColor };
      iconColor = textSecondary;
      break;
  }

  const card = (
    <View
      style={[
        styles.card,
        { backgroundColor: surfaceBg, borderColor },
        !isRead && styles.unreadCard,
      ]}
    >
      {!isRead && <View style={styles.unreadDot} />}
      <View style={styles.row}>
        <View style={[styles.iconCircle, circleStyle]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <View style={[styles.textCol, !isRead && styles.textColUnread]}>
          <Text style={[styles.title, { color: textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.body, { color: textSecondary }]} numberOfLines={2}>
            {body}
          </Text>
          <Text style={[styles.time, { color: textDisabled }]}>
            {formatRelativeTime(createdAt)}
          </Text>
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {card}
      </TouchableOpacity>
    );
  }
  return card;
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  unreadCard: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  unreadDot: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
  },
  textColUnread: {
    paddingRight: 20,
  },
  title: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  body: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 2,
  },
  time: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 4,
  },
});

export default NotificationCard;
