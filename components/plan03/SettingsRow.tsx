import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  onPress: () => void;
  showChevron?: boolean;
  rightElement?: React.ReactNode;
  isLast?: boolean;
}

const SettingsRow = ({
  icon,
  iconColor,
  label,
  onPress,
  showChevron = true,
  rightElement,
  isLast = false,
}: SettingsRowProps) => {
  const isDark = useIsDark();
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  return (
    <View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        activeOpacity={0.7}
        style={styles.row}
      >
        <Ionicons name={icon} size={24} color={iconColor ?? colors.primary} />
        <Text style={[styles.label, { color: textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
        {rightElement
          ? rightElement
          : showChevron && <Ionicons name="chevron-forward" size={20} color={textDisabled} />}
      </TouchableOpacity>
      {!isLast && <View style={[styles.divider, { backgroundColor: borderColor }]} />}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 16,
  },
  label: {
    flex: 1,
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
});

export default SettingsRow;
