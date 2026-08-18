import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export interface RadioOption {
  key: string;
  label: string;
}

interface RadioGroupProps {
  options: RadioOption[];
  value: string | null;
  onChange: (key: string) => void;
  disabled?: boolean;
}

/**
 * §8.2 single-select radio list. Used by cancel-reason, settings.
 * Selected row: primary border + accent tint; unselected: surface + border.
 */
const RadioGroup = ({ options, value, onChange, disabled = false }: RadioGroupProps) => {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = value === option.key;
        return (
          <TouchableOpacity
            key={option.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled }}
            accessibilityLabel={option.label}
            disabled={disabled}
            onPress={() => onChange(option.key)}
            activeOpacity={0.8}
            style={[
              styles.row,
              {
                borderColor: isSelected ? colors.primary : borderColor,
                backgroundColor: isSelected ? colors.accentLight : surfaceBg,
              },
            ]}
          >
            <View
              style={[
                styles.circle,
                { borderColor: isSelected ? colors.primary : borderColor },
              ]}
            >
              {isSelected && <View style={styles.dot} />}
            </View>
            <Text
              style={[
                styles.label,
                { color: disabled ? textDisabled : textPrimary },
              ]}
            >
              {option.label}
            </Text>
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
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  label: {
    fontFamily: "Jakarta-Regular",
    fontSize: 16,
  },
});

export default RadioGroup;
