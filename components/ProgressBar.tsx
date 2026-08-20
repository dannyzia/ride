import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface ProgressBarProps {
  current: number;
  total: number;
  height?: number;
  label?: string;
}

/**
 * §8.2 progress bar. Clamped % fill on a tinted track; optional label below.
 */
const ProgressBar = ({ current, total, height = 8, label }: ProgressBarProps) => {
  const isDark = useIsDark();
  const trackColor = isDark ? colors.primaryLightDark : colors.primaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const pct = total > 0 ? Math.max(0, Math.min(100, (current / total) * 100)) : 0;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: Math.min(current, total) }}
    >
      <View style={[styles.track, { height, backgroundColor: trackColor }]}>
        <View
          style={[
            styles.fill,
            { width: `${pct}%`, backgroundColor: colors.primary, borderRadius: height / 2 },
          ]}
        />
      </View>
      {label ? <Text style={[styles.label, { color: textSecondary }]}>{label}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: "100%",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
  label: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 6,
  },
});

export default ProgressBar;
