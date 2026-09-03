/**
 * R3.1: Persistent red SOS banner for home screens.
 *
 * Shows when the user has an active SOS alert. Tapping navigates to the
 * SOS screen. Pulsing animation draws attention. High-intensity variant
 * (3+ alerts in 60s) shows a more urgent style.
 */
import { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSosActive } from "@/lib/useSosActive";

export default function SosBanner() {
  const { active, recentAlertCount, isHighIntensity } = useSosActive();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulseAnim]);

  if (!active) return null;

  const bgColor = isHighIntensity ? "#B91C1C" : "#DC2626";
  const label = isHighIntensity
    ? `🚨 HIGH INTENSITY — ${recentAlertCount} alerts in 60s`
    : recentAlertCount > 1
      ? `🚨 SOS Active — ${recentAlertCount} alerts`
      : "🚨 SOS Active";

  return (
    <Animated.View style={[styles.banner, { backgroundColor: bgColor, opacity: pulseAnim }]}>
      <TouchableOpacity
        style={styles.bannerInner}
        onPress={() => router.push("/(main)/(customer)/emergency-sos")}
        activeOpacity={0.8}
      >
        <Ionicons name="alert-circle" size={20} color="#FFF" />
        <Text style={styles.bannerText} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.bannerTap}>TAP TO VIEW</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  bannerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bannerText: {
    flex: 1,
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },
  bannerTap: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 12,
    letterSpacing: 1,
  },
});
