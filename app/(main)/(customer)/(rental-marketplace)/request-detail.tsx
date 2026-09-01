/**
 * Rental request detail — customer view with bid feed, options chips,
 * schedule/duration, trust signals, countdown states (§F.4), re-select banner.
 *
 * Route: /(rental-marketplace)/request-detail?id=...
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import CargoSummary from "./_components/CargoSummary";
import { describeVehicleType } from "./_truckCatalog";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

const RANK_COLORS: Record<string, string> = {
  Best: "#0CC25F",
  "2nd": "#3B82F6",
  "3rd": "#F59E0B",
};

const STATUS_LABELS: Record<string, string> = {
  broadcasting: "Collecting Bids",
  collecting: "Collecting Bids",
  awarded: "Awarded",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  no_bidders: "No Bids Received",
};

interface RequestDetail {
  id: string;
  category: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  cargo_tags?: string[] | null;
  cargo_weight_kg?: number | null;
  cargo_volume_m3?: string | number | null;
  cargo_description?: string | null;
  rental_options?: string | null;
  requested_vehicle_type?: string | null;
  scheduled_start_at?: string | null;
  duration_hours?: number | null;
  soft_deadline_at: string;
  awarded_bid_id: string | null;
  awarded_at: string | null;
  confirmation_deadline_at: string | null;
  tracking_required: boolean;
  created_at: string;
}

interface Bid {
  id: string;
  fleet_id: string;
  vehicle_type: string;
  quoted_price_bdt: number;
  overtime_rate_bdt?: number | null;
  quoted_notes: string | null;
  status: string;
  submitted_at: string;
  rank?: number;
  rank_badge?: string | null;
  fleet_rating?: number;
  fleet_completed_count?: number;
}

export default function RequestDetailScreen() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${SERVER_URL}/api/rental/requests/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRequest(data.request);
        setBids(data.bids ?? []);
      }
    } catch (err) {
      logger.error("[request-detail] fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleAccept = async () => {
    if (!selectedBidId || !id) return;
    setAccepting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${SERVER_URL}/api/rental/requests/${id}/accept-bid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bid_id: selectedBidId }),
      });

      const data = await res.json();
      if (!res.ok) {
        logger.error("[request-detail] accept error", data.message);
        return;
      }

      router.replace("/(main)/(customer)/(rental-marketplace)/confirmed");
    } catch (err) {
      logger.error("[request-detail] accept error", err);
    } finally {
      setAccepting(false);
    }
  };

  // Countdown
  const deadline = request ? new Date(request.soft_deadline_at).getTime() - Date.now() : 0;
  const minutesLeft = Math.max(0, Math.floor(deadline / 60000));
  const secondsLeft = Math.max(0, Math.floor((deadline % 60000) / 1000));

  const isActive = ["broadcasting", "collecting"].includes(request?.status ?? "");
  const isAwarded = ["awarded", "confirmed"].includes(request?.status ?? "");

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 18, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          {STATUS_LABELS[request?.status ?? ""] ?? request?.status}
        </Text>
        {deadline > 0 && isActive && (
          <View style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: textPrimary }}>
              {minutesLeft}:{String(secondsLeft).padStart(2, "0")}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Re-select banner (§F.7) */}
        {request?.status === "collecting" && request.awarded_at && (
          <View style={{ backgroundColor: colors.amber + "18", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.amber }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="refresh" size={18} color={colors.amber} />
              <Text style={{ fontSize: 13, fontFamily: "JakartaSemiBold", color: colors.amber, marginLeft: 8 }}>
                Fleet couldn't assign a driver
              </Text>
            </View>
            <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 6 }}>
              Pick another bid. Prices unchanged.
            </Text>
          </View>
        )}

        {/* Route summary */}
        <View style={{ backgroundColor: surfaceBg, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <Ionicons name="location" size={14} color={colors.primary} />
            <Text style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginLeft: 8, flex: 1 }} numberOfLines={1}>
              {request?.pickup_address}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="flag" size={14} color={colors.danger} />
            <Text style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginLeft: 8, flex: 1 }} numberOfLines={1}>
              {request?.dropoff_address}
            </Text>
          </View>
        </View>

        {/* Schedule + duration */}
        {(request?.scheduled_start_at || request?.duration_hours) && (
          <View style={{ backgroundColor: surfaceBg, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor }}>
            {request?.scheduled_start_at && (
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                <Ionicons name="calendar" size={14} color={colors.primary} />
                <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textPrimary, marginLeft: 8 }}>
                  Starts {new Date(request.scheduled_start_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                </Text>
              </View>
            )}
            {request?.duration_hours && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="time" size={14} color={colors.primary} />
                <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textPrimary, marginLeft: 8 }}>
                  Duration: {request.duration_hours}h
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Options chips (ruling 13) */}
        {request?.rental_options && request.rental_options.split(",").length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
            {request.rental_options.split(",").map((opt) => (
              <View key={opt} style={{ backgroundColor: colors.amber + "18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginRight: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontFamily: "JakartaSemiBold", color: colors.amber }}>{opt.trim()}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Cargo summary */}
        {request && (
          <View style={{ marginBottom: 16 }}>
            <CargoSummary
              cargoTags={request.cargo_tags}
              cargoWeightKg={request.cargo_weight_kg}
              cargoVolumeM3={request.cargo_volume_m3}
              cargoDescription={request.cargo_description}
              rentalOptionsCsv={request.rental_options}
              requestedVehicleType={request.requested_vehicle_type}
            />
          </View>
        )}

        {/* Tracking toggle info */}
        {request?.tracking_required && (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.primary + "18", borderRadius: 10, padding: 10, marginBottom: 16 }}>
            <Ionicons name="navigate" size={16} color={colors.primary} />
            <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: colors.primary, marginLeft: 8 }}>
              Live Tracking Required — fleet names driver+vehicle at bid time
            </Text>
          </View>
        )}

        {/* Payment disclosure (§F.3) */}
        <View style={{ backgroundColor: "#FEF3C7", borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: "#92400E" }}>
            Payment is made directly to the driver — not through the app.
          </Text>
        </View>

        {/* Bid feed */}
        <Text style={{ fontSize: 16, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 10 }}>
          Bids ({bids.length})
        </Text>

        {bids.length === 0 && isActive ? (
          <View style={{ padding: 30, alignItems: "center" }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 14, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12 }}>
              Waiting for fleet bids...
            </Text>
          </View>
        ) : (
          bids.map((bid) => {
            const isSelected = selectedBidId === bid.id;
            return (
              <TouchableOpacity
                key={bid.id}
                onPress={() => isActive && setSelectedBidId(bid.id)}
                disabled={!isActive}
                style={{
                  backgroundColor: surfaceBg,
                  borderWidth: 2,
                  borderColor: isSelected ? colors.primary : borderColor,
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 10,
                  flexDirection: "row",
                  alignItems: "center",
                }}
                accessibilityLabel={`Bid from fleet: ${bid.quoted_price_bdt / 100} taka`}
              >
                {/* Rank badge */}
                {bid.rank_badge && (
                  <View style={{ backgroundColor: RANK_COLORS[bid.rank_badge] ?? "#6B7280", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 12 }}>
                    <Text style={{ color: "#FFFFFF", fontSize: 11, fontFamily: "JakartaSemiBold" }}>
                      {bid.rank_badge}
                    </Text>
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontFamily: "JakartaBold", color: colors.primary }}>
                    ৳{(bid.quoted_price_bdt / 100).toFixed(0)}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
                    {describeVehicleType(bid.vehicle_type)}
                  </Text>
                  {bid.fleet_rating != null && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginLeft: 4 }}>
                        {bid.fleet_rating.toFixed(1)} · {bid.fleet_completed_count ?? 0} trips
                      </Text>
                    </View>
                  )}
                  {bid.overtime_rate_bdt != null && (
                    <Text style={{ fontSize: 11, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
                      +৳{(bid.overtime_rate_bdt / 100).toFixed(0)}/hr overtime
                    </Text>
                  )}
                </View>

                {isSelected && <Ionicons name="checkmark-circle" size={24} color={colors.primary} />}
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Accept button */}
      {selectedBidId && isActive && (
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: surfaceBg, borderTopWidth: 1, borderTopColor: borderColor, padding: 16 }}>
          <TouchableOpacity
            onPress={handleAccept}
            disabled={accepting}
            style={{ backgroundColor: colors.primary, borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center" }}
          >
            {accepting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
                Accept This Bid
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
