import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

const NotificationSkeleton = () => {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  return (
    <View style={[styles.card, { backgroundColor: surfaceBg, borderColor }]}>
      <View style={styles.row}>
        <View style={[styles.circle, { backgroundColor: borderColor }]} />
        <View style={styles.lines}>
          <View style={[styles.lineA, { backgroundColor: borderColor }]} />
          <View style={[styles.lineB, { backgroundColor: borderColor }]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    opacity: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  lines: {
    flex: 1,
  },
  lineA: {
    width: 100,
    height: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  lineB: {
    width: 60,
    height: 10,
    borderRadius: 5,
  },
});

export default NotificationSkeleton;
