import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export interface CheckboxOption {
  label: string;
  value: string;
  description?: string;
}

interface CheckboxGroupProps {
  options: CheckboxOption[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
}

/**
 * §8.2 multi-select checkbox list. Mirrors RadioGroup row styling with
 * checkbox icons and optional per-option descriptions.
 */
const CheckboxGroup = ({ options, selected, onToggle, disabled = false }: CheckboxGroupProps) => {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isChecked = selected.includes(option.value);
        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isChecked, disabled }}
            accessibilityLabel={option.label}
            disabled={disabled}
            onPress={() => onToggle(option.value)}
            activeOpacity={0.8}
            style={[
              styles.row,
              {
                borderColor: isChecked ? colors.primary : borderColor,
                backgroundColor: isChecked ? colors.accentLight : surfaceBg,
              },
            ]}
          >
            <Ionicons
              name={isChecked ? "checkbox" : "square-outline"}
              size={22}
              color={isChecked ? colors.primary : disabled ? textDisabled : borderColor}
              style={styles.icon}
            />
            <View style={styles.textContainer}>
              <Text
                style={[
                  styles.label,
                  { color: disabled ? textDisabled : textPrimary },
                ]}
              >
                {option.label}
              </Text>
              {option.description ? (
                <Text
                  style={[
                    styles.description,
                    { color: disabled ? textDisabled : textSecondary },
                  ]}
                >
                  {option.description}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  description: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 2,
  },
});

export default CheckboxGroup;
