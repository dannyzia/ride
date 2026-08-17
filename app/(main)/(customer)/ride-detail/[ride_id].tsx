import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { colors, radii } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { formatBDT, formatDateTime } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import RideCardSkeleton from "@/components/RideCardSkeleton";

type BadgeStatus = "completed" | "cancelled" | "in_progress" | "scheduled";

interface FareBreakdown {
  base_fare_bdt?: number | null;
  distance_charge_bdt?: number | null;
  time_charge_bdt?: number | null;
  surge_fee_bdt?: number | null;
  total_bdt?: number | null;
}

interface RideDetail {
  id: string;
  status: string;
  origin_address: string | null;
  destination_address: string | null;
  origin_latitude: number | null;
  origin_longitude: number | null;
  destination_latitude: number | null;
  destination_longitude: number | null;
  vehicle_type: string | null;
  created_at: string | null;
  completed_at: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  fare_breakdown: FareBreakdown | null;
  wait_fee_bdt: number | null;
  tip_bdt: number | null;
  applied_discount_bdt: number | null;
  rider_payable_bdt: number | null;
}

interface DriverDetail {
  id: string;
  full_name: string | null;
  rating: number | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  avatar_url: string | null;
}

const toPaisa = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toBadgeStatus = (status: string): BadgeStatus => {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in_progress";
  if (status === "cancelled") return "cancelled";
  if (status === "expired" || status === "no_drivers") return "cancelled";
  if (status === "scheduled") return "scheduled";
  return "in_progress";
};

// 48h dispute window — mirrors the server gate in rider/fare-disputes+api.ts
// (172800000 ms). Hide, don't disable (doc 03 R2.5 #2, binding).
const DISPUTE_WINDOW_MS = 172800000;
const canDisputeRide = (completedAt: string | null): boolean =>
  !!completedAt && Date.now() - new Date(completedAt).getTime() <= DISPUTE_WINDOW_MS;

const RideDetailScreen = () => {
  const { ride_id } = useLocalSearchParams<{ ride_id: string }>();
  const [ride, setRide] = useState<RideDetail | null>(null);
  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const fetchRide = useCallback(async () => {
    if (typeof ride_id !== "string" || !ride_id) return;
    setLoading(true);
    setError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`${API_URL}/api/ride/${ride_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json?.ride) throw new Error("Ride not found");
      setRide(json.ride);
      setDriver(json.driver ?? null);
    } catch (e) {
      logger.error("[ride-detail] fetch failed", e);
      setError(true);
      setRide(null);
      setDriver(null);
    } finally {
      setLoading(false);
    }
  }, [ride_id]);

  useEffect(() => {
    fetchRide();
  }, [fetchRide]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <View style={styles.skeletonWrap}>
          <RideCardSkeleton />
          <RideCardSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !ride) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={48} color={colors.danger} />
          <Text style={[styles.errorTitle, { color: textPrimary }]}>Could not load ride</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={fetchRide}
            accessibilityRole="button"
            accessibilityLabel="Retry loading ride"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isCancelled = ride.status === "cancelled";

  const fb: FareBreakdown = ride.fare_breakdown ?? {};
  const base = toPaisa(fb.base_fare_bdt);
  const distance = toPaisa(fb.distance_charge_bdt);
  const time = toPaisa(fb.time_charge_bdt);
  const surge = toPaisa(fb.surge_fee_bdt);
  const wait = toPaisa(ride.wait_fee_bdt);
  const tip = toPaisa(ride.tip_bdt);
  const discount = toPaisa(ride.applied_discount_bdt);
  const total = toPaisa(ride.rider_payable_bdt) ?? toPaisa(fb.total_bdt) ?? 0;

  const fareRows: { label: string; value: number }[] = [
    ...(base !== null ? [{ label: "Base Fare", value: base }] : []),
    ...(distance !== null ? [{ label: "Distance", value: distance }] : []),
    ...(time !== null ? [{ label: "Time", value: time }] : []),
    ...(surge !== null && surge > 0 ? [{ label: "Surge", value: surge }] : []),
    ...(wait !== null && wait > 0 ? [{ label: "Waiting Fee", value: wait }] : []),
    ...(tip !== null && tip > 0 ? [{ label: "Tip", value: tip }] : []),
    ...(discount !== null && discount > 0 ? [{ label: "Discount", value: -discount }] : []),
  ];

  const vehicleLine = [driver?.vehicle_type, driver?.vehicle_plate].filter(Boolean).join(" · ");

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: textPrimary }]}>Ride Detail</Text>
          <TouchableOpacity
            onPress={() => setTheme(isDark ? "light" : "dark")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Toggle theme"
          >
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={24}
              color={textPrimary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.statusRow}>
          <StatusBadge status={toBadgeStatus(ride.status)} size="md" />
          <Text style={[styles.statusDate, { color: textSecondary }]}>
            {formatDateTime(ride.completed_at ?? ride.created_at)}
          </Text>
        </View>

        {/* Map snapshot: 180px height, 16px radius, route green dot → red dot */}
        <View style={[styles.mapCard, { backgroundColor: surfaceBg, borderColor }]}>
          <View style={styles.routeRow}>
            <View style={styles.routeLine}>
              <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
              <View style={[styles.routeConnector, { backgroundColor: borderColor }]} />
              <View style={[styles.routeDot, { backgroundColor: colors.danger }]} />
            </View>
            <View style={styles.routeTextCol}>
              <Text style={[styles.addrLabel, { color: textSecondary }]}>Pickup</Text>
              <Text style={[styles.addrText, { color: textPrimary }]} numberOfLines={2}>
                {ride.origin_address ?? "—"}
              </Text>
              <Text style={[styles.addrLabel, styles.addrLabelGap, { color: textSecondary }]}>
                Destination
              </Text>
              <Text style={[styles.addrText, { color: textPrimary }]} numberOfLines={2}>
                {ride.destination_address ?? "—"}
              </Text>
            </View>
          </View>
        </View>

        {isCancelled && ride.cancel_reason ? (
          <View style={[styles.card, { backgroundColor: surfaceBg, borderColor }]}>
            <View style={styles.reasonRow}>
              <Ionicons name="close-circle" size={20} color={colors.danger} />
              <Text style={[styles.reasonLabel, { color: textSecondary }]}>
                Cancellation Reason
              </Text>
            </View>
            <Text style={[styles.reasonText, { color: textPrimary }]}>{ride.cancel_reason}</Text>
            {ride.cancelled_by && (
              <Text style={[styles.cancelledBy, { color: textSecondary }]}>
                Cancelled by {ride.cancelled_by}
              </Text>
            )}
          </View>
        ) : null}

        {!isCancelled && driver ? (
          <View style={[styles.card, styles.driverCard, { backgroundColor: surfaceBg, borderColor }]}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: colors.primaryLight, borderColor: colors.primary },
              ]}
            >
              {driver.avatar_url ? (
                <Image source={{ uri: driver.avatar_url }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitial}>
                  {(driver.full_name ?? "D").charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.driverInfo}>
              <Text style={[styles.driverName, { color: textPrimary }]} numberOfLines={1}>
                {driver.full_name ?? "Driver"}
              </Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color={colors.amber} />
                <Text style={[styles.ratingText, { color: textSecondary }]}>
                  {typeof driver.rating === "number" ? driver.rating.toFixed(1) : "—"}
                </Text>
              </View>
              <Text style={[styles.vehicleText, { color: textSecondary }]}>
                {vehicleLine || ride.vehicle_type || "—"}
              </Text>
            </View>
          </View>
        ) : null}

        {!isCancelled && !driver ? (
          <View style={[styles.card, { backgroundColor: surfaceBg, borderColor }]}>
            <Text style={[styles.noDriverText, { color: textDisabled }]}>
              Driver info unavailable
            </Text>
          </View>
        ) : null}

        {!isCancelled ? (
          <View style={[styles.card, { backgroundColor: surfaceBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Fare Breakdown</Text>
            {fareRows.map((row) => (
              <View key={row.label} style={styles.fareRow}>
                <Text style={[styles.fareLabel, { color: textSecondary }]}>{row.label}</Text>
                <Text style={[styles.fareValue, { color: textPrimary }]}>{formatBDT(row.value)}</Text>
              </View>
            ))}
            <View style={[styles.fareRow, styles.fareTotalRow, { borderTopColor: borderColor }]}>
              <Text style={[styles.fareTotalLabel, { color: textPrimary }]}>Total</Text>
              <Text style={[styles.fareTotalValue, { color: colors.primary }]}>
                {formatBDT(total)}
              </Text>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.rebookBtn, { backgroundColor: colors.primary }]}
          onPress={() =>
            router.push({
              pathname: "/(main)/(customer)/(tabs)/home",
              params: {
                rebook_origin: ride.origin_address ?? "",
                rebook_dest: ride.destination_address ?? "",
                rebook_origin_lat: ride.origin_latitude?.toString() ?? "",
                rebook_origin_lng: ride.origin_longitude?.toString() ?? "",
                rebook_dest_lat: ride.destination_latitude?.toString() ?? "",
                rebook_dest_lng: ride.destination_longitude?.toString() ?? "",
                vehicle_type: ride.vehicle_type ?? "",
              },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Rebook ride"
        >
          <Text style={styles.rebookBtnText}>Rebook Ride</Text>
        </TouchableOpacity>

        {ride.status === "completed" && canDisputeRide(ride.completed_at) && (
          <TouchableOpacity
            style={[styles.disputeBtn, { backgroundColor: `${colors.amber}1A` }]}
            onPress={() =>
              router.push(`/(main)/(customer)/fare-dispute?rideId=${ride.id}`)
            }
            accessibilityRole="button"
            accessibilityLabel="Dispute fare"
          >
            <Text style={[styles.disputeBtnText, { color: colors.amber }]}>
              Dispute Fare
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.reportBtn, { backgroundColor: surfaceBg, borderColor }]}
          onPress={() =>
            router.push(`/(main)/(customer)/report-issue?rideId=${ride.id}`)
          }
          accessibilityRole="button"
          accessibilityLabel="Report issue"
        >
          <Text style={[styles.reportBtnText, { color: textPrimary }]}>Report Issue</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  skeletonWrap: {
    padding: 20,
    gap: 12,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 20,
    marginTop: 16,
  },
  retryBtn: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: radii.pill,
  },
  retryBtnText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
    color: colors.white,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
    textAlign: "center",
    flex: 1,
    marginHorizontal: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  statusDate: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  mapCard: {
    height: 180,
    borderRadius: radii.lg,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  routeRow: {
    flexDirection: "row",
    gap: 12,
  },
  routeLine: {
    width: 10,
    alignItems: "center",
    gap: 4,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeConnector: {
    width: 2,
    flex: 1,
    minHeight: 24,
  },
  routeTextCol: {
    flex: 1,
  },
  addrLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginBottom: 2,
  },
  addrLabelGap: {
    marginTop: 12,
  },
  addrText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  reasonLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  reasonText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  cancelledBy: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 8,
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    fontFamily: "Jakarta-Bold",
    fontSize: 20,
    color: colors.primary,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  vehicleText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 2,
  },
  noDriverText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    textAlign: "center",
  },
  sectionTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 16,
    marginBottom: 8,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  fareLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
  },
  fareValue: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
  },
  fareTotalRow: {
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 10,
  },
  fareTotalLabel: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
  },
  fareTotalValue: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
  },
  rebookBtn: {
    height: 56,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  rebookBtnText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
    color: colors.white,
  },
  disputeBtn: {
    height: 48,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  disputeBtnText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  reportBtn: {
    height: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  reportBtnText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
});

export default RideDetailScreen;
