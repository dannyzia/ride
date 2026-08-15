import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

const WalletSkeleton = () => {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  return (
    <View>
      <View style={[styles.balanceCard, { backgroundColor: surfaceBg, borderColor }]}>
        <View style={styles.blocks}>
          <View style={[styles.balanceLabel, { backgroundColor: borderColor }]} />
          <View style={[styles.balanceValue, { backgroundColor: borderColor }]} />
        </View>
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.txCard, { backgroundColor: surfaceBg, borderColor }]}>
          <View style={styles.txRow}>
            <View style={[styles.txCircle, { backgroundColor: borderColor }]} />
            <View style={styles.txLines}>
              <View style={[styles.txLineA, { backgroundColor: borderColor }]} />
              <View style={[styles.txLineB, { backgroundColor: borderColor }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  balanceCard: {
    height: 140,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    justifyContent: "center",
  },
  blocks: {
    opacity: 0.6,
  },
  balanceLabel: {
    width: 80,
    height: 12,
    borderRadius: 6,
    marginBottom: 12,
  },
  balanceValue: {
    width: 160,
    height: 24,
    borderRadius: 12,
  },
  txCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    opacity: 0.6,
  },
  txCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  txLines: {
    flex: 1,
  },
  txLineA: {
    width: 120,
    height: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  txLineB: {
    width: 72,
    height: 10,
    borderRadius: 5,
  },
});

export default WalletSkeleton;
