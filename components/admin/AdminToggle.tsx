// Switch component used in admin screens.
// Sizes/colors align with the dark admin theme.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/goRide";

interface AdminToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  danger?: boolean; // when true, the "on" track is red (e.g. dispatch pause)
}

export function AdminToggle({
  value,
  onValueChange,
  label,
  disabled,
  danger,
}: AdminToggleProps) {
  const trackOn = danger ? colors.danger : colors.primary;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => !disabled && onValueChange(!value)}
        style={[
          styles.track,
          { backgroundColor: value ? trackOn : "#2A2D35" },
          disabled && styles.disabled,
        ]}
      >
        <View
          style={[
            styles.thumb,
            { transform: [{ translateX: value ? 20 : 0 }] },
          ]}
        />
      </Pressable>
      {label ? (
        <Text style={[styles.label, disabled && styles.disabledText]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  track: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: "center",
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  disabled: { opacity: 0.4 },
  disabledText: { opacity: 0.5 },
  label: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
});
