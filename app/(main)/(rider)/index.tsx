import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Map from "@/components/Map";
import { useWSStore } from "@/store";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import { colors, spacing, radii } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";
import { FloatingNavMenu } from "@/components/FloatingNavMenu";
import RideOfferSheet from "@/components/RideOfferSheet";
import SlideButton from "@/components/SlideButton";
import DriverStatusBadge from "@/components/DriverStatusBadge";

type DriverHomeState =
  | "offline"
  | "online"
  | "pickup"
  | "arrived"
  | "ride_in_progress"
  | "ride_complete";

interface DailyStats {
  earnings_bdt: number;
  trips: number;
  online_hours: number;
  rating: number;
  acceptance_rate: number;
}

export default function DriverHomeScreen() {
  const [driverState, setDriverState] = useState<DriverHomeState>("offline");
  const [stats, setStats] = useState<DailyStats>({
    earnings_bdt: 0,
    trips: 0,
    online_hours: 0,
    rating: 4.8,
    acceptance_rate: 92,
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [toggling, setToggling] = useState(false);

  const { activeOffer } = useDriverFlowStore();
  const ws = useWSStore((s) => s.ws);

  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  // ── Fetch daily stats ──
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`${API_URL}/api/driver/daily-stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      logger.error("[driver-home] stats fetch failed", e);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── WebSocket state listener ──
  useEffect(() => {
    if (!ws) return;
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "ride:matched") {
          setDriverState("pickup");
        } else if (msg.type === "rider:cancelled") {
          Alert.alert("Ride Cancelled", "The rider has cancelled the ride.");
          setDriverState("online");
        }
      } catch {
        // ignore
      }
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws]);

  // ── Toggle Online/Offline ──
  const toggleOnline = async () => {
    setToggling(true);
    try {
      const newStatus = driverState === "offline" ? "online" : "offline";
      const res = await fetch(`${API_URL}/api/driver/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_online: newStatus === "online" }),
      });
      if (res.ok) {
        setDriverState(newStatus === "online" ? "online" : "offline");
      }
    } catch (e) {
      logger.error("[driver-home] toggle failed", e);
    } finally {
      setToggling(false);
    }
  };

  // ── Arrived at pickup ──
  const handleArrived = () => {
    setDriverState("arrived");
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "driver:arrived" }));
    }
  };

  // ── Start ride ──
  const handleStartRide = () => {
    setDriverState("ride_in_progress");
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ride:started" }));
    }
  };

  // ── Complete ride ──
  const handleCompleteRide = () => {
    setDriverState("ride_complete");
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ride:completed" }));
    }
  };

  // ── Go back online after ride ──
  const handleBackToOnline = () => {
    setDriverState("online");
    fetchStats();
  };

  // ── RENDER: Stats Grid ──
  const renderStats = () => (
    <View style={styles.statsGrid}>
      <View style={[styles.statCard, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}>
        <Text style={[styles.statValue, { color: textPrimary }]}>
          ৳{(stats.earnings_bdt / 100).toFixed(0)}
        </Text>
        <Text style={[styles.statLabel, { color: textSecondary }]}>Earnings</Text>
      </View>
      <View style={[styles.statCard, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}>
        <Text style={[styles.statValue, { color: textPrimary }]}>{stats.trips}</Text>
        <Text style={[styles.statLabel, { color: textSecondary }]}>Trips</Text>
      </View>
      <View style={[styles.statCard, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}>
        <Text style={[styles.statValue, { color: textPrimary }]}>{stats.online_hours.toFixed(1)}h</Text>
        <Text style={[styles.statLabel, { color: textSecondary }]}>Online</Text>
      </View>
      <View style={[styles.statCard, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}>
        <Text style={[styles.statValue, { color: colors.amber }]}>★ {stats.rating.toFixed(1)}</Text>
        <Text style={[styles.statLabel, { color: textSecondary }]}>Rating</Text>
      </View>
    </View>
  );

  // ── RENDER: OFFLINE STATE ──
  const renderOfflineCard = () => (
    <View style={[styles.bottomCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: textPrimary }]}>You're Offline</Text>
        <DriverStatusBadge status="inactive" />
      </View>
      <Text style={[styles.cardSubtext, { color: textSecondary }]}>
        Go online to start receiving ride requests
      </Text>

      {loadingStats ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
      ) : (
        renderStats()
      )}

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: colors.primary }]}
        onPress={toggleOnline}
        disabled={toggling}
      >
        {toggling ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.actionButtonText}>Go Online</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // ── RENDER: ONLINE STATE ──
  const renderOnlineCard = () => (
    <View style={[styles.bottomCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[styles.pulseDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.cardTitle, { color: textPrimary }]}>You're Online</Text>
        </View>
        <DriverStatusBadge status="active" />
      </View>
      <Text style={[styles.cardSubtext, { color: textSecondary }]}>
        Waiting for ride requests near you...
      </Text>

      {renderStats()}

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: "transparent", borderWidth: 1.5, borderColor: borderColor }]}
        onPress={toggleOnline}
        disabled={toggling}
      >
        {toggling ? (
          <ActivityIndicator size="small" color={textSecondary} />
        ) : (
          <Text style={[styles.actionButtonText, { color: textSecondary }]}>Go Offline</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // ── RENDER: PICKUP STATE ──
  const renderPickupCard = () => (
    <View style={[styles.bottomCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: textPrimary }]}>Pickup Rider</Text>
      </View>
      <View style={[styles.infoRow, { borderBottomColor: borderColor }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>R</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.infoTitle, { color: textPrimary }]}>Rider</Text>
          <Text style={[styles.infoSub, { color: textSecondary }]}>Head to pickup location</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: colors.primary }]}
        onPress={handleArrived}
      >
        <Text style={styles.actionButtonText}>I've Arrived</Text>
      </TouchableOpacity>
    </View>
  );

  // ── RENDER: ARRIVED STATE ──
  const renderArrivedCard = () => (
    <View style={[styles.bottomCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: textPrimary }]}>Waiting for Rider</Text>
      </View>
      <Text style={[styles.cardSubtext, { color: textSecondary }]}>
        Let the rider know you've arrived. Wait up to 5 minutes.
      </Text>
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: colors.primary }]}
        onPress={handleStartRide}
      >
        <Text style={styles.actionButtonText}>Start Ride</Text>
      </TouchableOpacity>
    </View>
  );

  // ── RENDER: RIDE IN PROGRESS ──
  const renderRideInProgressCard = () => (
    <View style={[styles.bottomCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: textPrimary }]}>Ride in Progress</Text>
      </View>
      <View style={[styles.infoRow, { borderBottomColor: borderColor }]}>
        <Ionicons name="navigate" size={20} color={colors.primary} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.infoTitle, { color: textPrimary }]}>Heading to destination</Text>
          <Text style={[styles.infoSub, { color: textSecondary }]}>Follow the route on map</Text>
        </View>
      </View>
      <View style={{ marginVertical: 12 }}>
        <SlideButton title="Slide to Complete" onComplete={handleCompleteRide} />
      </View>
    </View>
  );

  // ── RENDER: RIDE COMPLETE ──
  const renderRideCompleteCard = () => (
    <View style={[styles.bottomCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: textPrimary }]}>Ride Complete</Text>
      </View>
      <View style={[styles.infoRow, { borderBottomColor: borderColor, justifyContent: "center" }]}>
        <Text style={[styles.fareText, { color: textPrimary }]}>৳245</Text>
        <Text style={[styles.infoSub, { color: textSecondary }]}>Collect cash from rider</Text>
      </View>
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: colors.primary }]}
        onPress={handleBackToOnline}
      >
        <Text style={styles.actionButtonText}>Back to Online</Text>
      </TouchableOpacity>
    </View>
  );

  // ── MAIN RENDER ──
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {/* Map Layer */}
      <View style={StyleSheet.absoluteFill}>
        <Map />
      </View>

      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: "transparent" }]}>
        <View style={{ width: 48 }} />
        <Text style={[styles.topBarTitle, { color: textPrimary }]}>
          {driverState === "offline" ? "Driver" : driverState === "online" ? "Online" : "On Trip"}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      {/* Hamburger Menu */}
      <FloatingNavMenu variant="driver" />

      {/* Ride Offer Sheet (absolute overlay) */}
      {activeOffer && <RideOfferSheet />}

      {/* Bottom Card */}
      <View style={styles.bottomCardContainer}>
        {driverState === "offline" && renderOfflineCard()}
        {driverState === "online" && renderOnlineCard()}
        {driverState === "pickup" && renderPickupCard()}
        {driverState === "arrived" && renderArrivedCard()}
        {driverState === "ride_in_progress" && renderRideInProgressCard()}
        {driverState === "ride_complete" && renderRideCompleteCard()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    zIndex: 10,
  },
  topBarTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomCardContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 24,
    zIndex: 20,
  },
  bottomCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
  cardSubtext: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
  },
  statLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 4,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  actionButton: {
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  actionButtonText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
    color: colors.white,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
  infoTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  infoSub: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 2,
  },
  fareText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 36,
    textAlign: "center",
  },
});
