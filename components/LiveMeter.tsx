/**
 * LiveMeter — in-progress ride fare estimate display.
 *
 * Shows a running timer, estimated fare, and trip progress during the ride.
 * Stage 0: displays the v2 estimate (fare from request time).
 * Stage 1: will show real-time v6 fare updates via WS ride:progress events.
 *
 * The component is display-only — it never computes fares. All values come
 * from the parent (ride-tracking screen) or the WebSocket message stream.
 */
import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface LiveMeterProps {
  /** Estimated fare in paisa from the request-time estimate. */
  estimatePaisa: number;
  /** Ride start timestamp (ms since epoch). Set when status → in_progress. */
  startedAtMs: number;
  /** Vehicle display name (e.g., "Bike Standard"). */
  vehicleType?: string;
  /** Whether night mode is active (night_mult > 1.0). */
  nightActive?: boolean;
}

/**
 * Format seconds into M:SS or H:MM:SS.
 */
function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format paisa to BDT display string.
 */
function formatPaisa(paisa: number): string {
  return `৳${(paisa / 100).toFixed(0)}`;
}

export default function LiveMeter({
  estimatePaisa,
  startedAtMs,
  vehicleType,
  nightActive = false,
}: LiveMeterProps) {
  const isDark = useIsDark();
  const [elapsed, setElapsed] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Timer: update every second
  useEffect(() => {
    const update = () => {
      const now = Date.now();
      setElapsed(Math.max(0, Math.floor((now - startedAtMs) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAtMs]);

  // Pulse animation on the meter dot
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const bg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <View style={[styles.container, { backgroundColor: bg, borderColor }]}>
      {/* Pulsing dot */}
      <View style={styles.dotRow}>
        <Animated.View
          style={[
            styles.pulseDot,
            { backgroundColor: colors.primary, opacity: pulseAnim },
          ]}
        />
        <Text style={[styles.liveLabel, { color: colors.primary }]}>LIVE</Text>
      </View>

      {/* Timer + Fare */}
      <View style={styles.mainRow}>
        <View style={styles.timerSection}>
          <Text style={[styles.timer, { color: textPrimary }]}>
            {formatDuration(elapsed)}
          </Text>
          <Text style={[styles.timerSub, { color: textSecondary }]}>
            Trip time
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.fareSection}>
          <Text style={[styles.fare, { color: colors.primary }]}>
            {formatPaisa(estimatePaisa)}
          </Text>
          <Text style={[styles.fareSub, { color: textSecondary }]}>
            Estimated fare
          </Text>
        </View>
      </View>

      {/* Night surcharge indicator */}
      {nightActive && (
        <View style={styles.nightBadge}>
          <Ionicons name="moon" size={12} color={colors.amber} />
          <Text style={styles.nightText}>Night rates active</Text>
        </View>
      )}

      {/* Vehicle type label */}
      {vehicleType ? (
        <Text style={[styles.vehicleLabel, { color: textDisabled }]}>
          {vehicleType}
        </Text>
      ) : null}
    </View>
  );
}

const textDisabled = colors.textDisabledDark;

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  dotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveLabel: {
    fontFamily: "Jakarta-Bold",
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  timerSection: {
    flex: 1,
  },
  timer: {
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
    fontVariant: ["tabular-nums"],
  },
  timerSub: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: textDisabled,
    marginHorizontal: 16,
    opacity: 0.3,
  },
  fareSection: {
    flex: 1,
    alignItems: "flex-end",
  },
  fare: {
    fontFamily: "Jakarta-Bold",
    fontSize: 24,
    fontVariant: ["tabular-nums"],
  },
  fareSub: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginTop: 2,
  },
  nightBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: `${colors.amber}15`,
    alignSelf: "flex-start",
  },
  nightText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    color: colors.amber,
  },
  vehicleLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
  },
});
