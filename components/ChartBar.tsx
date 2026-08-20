import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export interface ChartBarDatum {
  label: string;
  value: number;
}

interface ChartBarProps {
  data: ChartBarDatum[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

/**
 * §8.2 vertical bar chart. Pure View-based bars scaled to the max value —
 * no svg, no chart lib, no animation (cheap-Android friendly).
 */
const ChartBar = ({ data, height = 160, color, formatValue }: ChartBarProps) => {
  const isDark = useIsDark();
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: textSecondary }]}>No data</Text>
      </View>
    );
  }

  const maxValue = data.reduce((max, d) => Math.max(max, d.value), 0);
  const valueRowHeight = formatValue ? 18 : 0;
  const maxBarHeight = Math.max(0, height - valueRowHeight);
  const barColor = color ?? colors.primary;

  return (
    <View style={styles.container}>
      <View style={[styles.barsRow, { height }]}>
        {data.map((d) => {
          const barHeight = maxValue > 0 ? (d.value / maxValue) * maxBarHeight : 0;
          return (
            <View key={d.label} style={styles.column}>
              {formatValue ? (
                <Text style={[styles.value, { color: textPrimary }]} numberOfLines={1}>
                  {formatValue(d.value)}
                </Text>
              ) : null}
              <View
                style={[
                  styles.bar,
                  { height: barHeight, backgroundColor: barColor },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.labelsRow}>
        {data.map((d) => (
          <Text
            key={d.label}
            style={[styles.barLabel, { color: textSecondary }]}
            numberOfLines={1}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  column: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  value: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    marginBottom: 2,
  },
  bar: {
    width: "65%",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  labelsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  barLabel: {
    flex: 1,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    textAlign: "center",
  },
});

export default ChartBar;
