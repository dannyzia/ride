import React from "react";
import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface RideCardSkeletonProps {
  style?: StyleProp<ViewStyle>;
}

const RideCardSkeleton = ({ style }: RideCardSkeletonProps) => {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  return (
    <View style={[styles.card, { backgroundColor: surfaceBg, borderColor }, style]}>
      <View style={styles.blocks}>
        <View style={[styles.headerLine, { backgroundColor: borderColor }]} />
        <View style={[styles.routeLineA, { backgroundColor: borderColor }]} />
        <View style={[styles.routeLineB, { backgroundColor: borderColor }]} />
        <View style={styles.footer}>
          <View style={[styles.footerCircle, { backgroundColor: borderColor }]} />
          <View style={styles.footerLines}>
            <View style={[styles.footerLineA, { backgroundColor: borderColor }]} />
            <View style={[styles.footerLineB, { backgroundColor: borderColor }]} />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  blocks: {
    opacity: 0.6,
  },
  headerLine: {
    width: 96,
    height: 12,
    borderRadius: 6,
    marginBottom: 20,
  },
  routeLineA: {
    width: "70%",
    height: 14,
    borderRadius: 7,
    marginBottom: 12,
  },
  routeLineB: {
    width: "55%",
    height: 14,
    borderRadius: 7,
    marginBottom: 20,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  footerCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  footerLines: {
    flex: 1,
  },
  footerLineA: {
    width: 120,
    height: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  footerLineB: {
    width: 72,
    height: 10,
    borderRadius: 5,
  },
});

export default RideCardSkeleton;
