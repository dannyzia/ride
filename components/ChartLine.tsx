import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface ChartLineProps {
  points: number[];
  height?: number;
  color?: string;
  labels?: string[];
}

const PAD = 8;

/**
 * §8.2 line/trend chart. svg polyline (react-native-svg is an existing dep)
 * over min/max-normalized points; hints when there is not enough data.
 */
const ChartLine = ({ points, height = 120, color, labels }: ChartLineProps) => {
  const isDark = useIsDark();
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const [width, setWidth] = useState(0);

  if (points.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: textSecondary }]}>Not enough data</Text>
      </View>
    );
  }

  const lineColor = color ?? colors.accent;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const innerHeight = Math.max(0, height - PAD * 2);
  const count = points.length;

  const coords = points.map((p, i) => {
    const x = count > 1 ? (i / (count - 1)) * width : 0;
    const normalized = span > 0 ? (p - min) / span : 0.5;
    const y = PAD + (1 - normalized) * innerHeight;
    return { x, y };
  });

  const polylinePoints = coords.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <View
      style={styles.container}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke={lineColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
      {labels && labels.length > 0 ? (
        <View style={styles.labelsRow}>
          {labels.map((label) => (
            <Text
              key={label}
              style={[styles.label, { color: textSecondary }]}
              numberOfLines={1}
            >
              {label}
            </Text>
          ))}
        </View>
      ) : null}
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
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  label: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
});

export default ChartLine;
