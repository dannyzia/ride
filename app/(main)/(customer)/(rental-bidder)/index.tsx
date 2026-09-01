/**
 * Rental bidder requests list — fleet staff sees all incoming rental requests.
 * Filtered by category, shows cargo/options as chips.
 * §F.0(b), §C.2 — uses GET /api/rental/requests/broadcasts (fleet discovery feed).
 *
 * The broadcasts endpoint returns eligible open requests for ≥1 of the caller's
 * qualifying fleets (service-zone filter §A.2.4), with own-bid status joined.
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
import { router } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

const STATUS_COLORS: Record<string, string> = {
  broadcasting: "#3B82F6",
  collecting: "#F59E0B",
  awarded: "#0CC25F",
  confirmed: "#8B5CF6",
  completed: "#6B7280",
  cancelled: "#EF4444",
  expired: "#9CA3AF",
  no_bidders: "#9CA3AF",
};

const CATEGORY_LABELS: Record<string, string> = {
  car_rental: "Car Rental",
  truck_rental: "Truck Rental",
  ambulance_scheduled: "Ambulance",
};

interface BroadcastRequest {
  id: string;
  category: string;
  urgency: string;
  status: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  cargo_tags?: string[] | null;
  cargo_weight_kg?: number | null;
  cargo_volume_m3?: string | number | null;
  cargo_description?: string | null;
  rental_options?: string | null;
  requested_vehicle_type?: string | null;
  scheduled_start_at?: string | null;
  duration_hours?: number | null;
  tracking_required: boolean;
  soft_deadline_at: string;
  created_at: string;
  // Caller's own bid
  already_bid: boolean;
  own_bid_status: string | null;
  own_bid_price: number | null;
  // Ambulance annotation
  ambulance_eligible: boolean | null;
}

export default function BidderRequestsScreen() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const [requests, setRequests] = useState<BroadcastRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      // Fleet discovery feed — eligible open requests for caller's qualifying fleets
      const res = await fetch(
        `${SERVER_URL}/api/rental/requests/broadcasts?page=${pageNum}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        const fetched: BroadcastRequest[] = data.requests ?? [];
        setRequests((prev) => (pageNum === 1 ? fetched : [...prev, ...fetched]));
        setHasMore(data.has_more ?? false);
      }
    } catch (err) {
      logger.error("[bidder-list] fetch error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchData(1);
    setRefreshing(false);
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchData(nextPage);
  };

  const filtered = filter
    ? requests.filter((r) => r.category === filter)
    : requests;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 14, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12 }}>
            Loading requests...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          Rental Requests
        </Text>
        <View style={{ backgroundColor: colors.primary + "20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 13, fontFamily: "JakartaSemiBold", color: colors.primary }}>
            {requests.length} request{requests.length !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>

      {/* Category filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ paddingHorizontal: 20, marginBottom: 12 }}
      >
        <FilterPill
          label="All"
          selected={filter === null}
          onPress={() => setFilter(null)}
          textPrimary={textPrimary}
          borderColor={borderColor}
          surfaceBg={surfaceBg}
        />
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <FilterPill
            key={key}
            label={label}
            selected={filter === key}
            onPress={() => setFilter(filter === key ? null : key)}
            textPrimary={textPrimary}
            borderColor={borderColor}
            surfaceBg={surfaceBg}
          />
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {filtered.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Ionicons name="car-outline" size={48} color={textSecondary} />
            <Text style={{ fontSize: 15, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12 }}>
              No requests available
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginTop: 4 }}>
              New rental requests will appear here
            </Text>
          </View>
        ) : (
          filtered.map((req) => {
            const statusColor = STATUS_COLORS[req.status] ?? textSecondary;
            return (
              <TouchableOpacity
                key={req.id}
                onPress={() => router.push(`/(main)/(customer)/(rental-bidder)/${req.id}`)}
                style={{
                  backgroundColor: surfaceBg,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 12,
                }}
                accessibilityLabel={`${CATEGORY_LABELS[req.category] ?? req.category} request to ${req.dropoff_address}${req.already_bid ? ' — already bid' : ''}`}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons
                      name={req.category === "truck_rental" ? "bus" : req.category === "ambulance_scheduled" ? "medkit" : "car-sport"}
                      size={18}
                      color={colors.primary}
                    />
                    <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: textPrimary, marginLeft: 8 }}>
                      {CATEGORY_LABELS[req.category] ?? req.category}
                    </Text>
                    {req.already_bid && (
                      <View style={{ backgroundColor: colors.primary + "20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
                        <Text style={{ fontSize: 10, fontFamily: "JakartaSemiBold", color: colors.primary }}>BIDDED</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ backgroundColor: statusColor + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontFamily: "JakartaSemiBold", color: statusColor }}>
                      {req.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                {req.already_bid && req.own_bid_price != null && (
                  <Text style={{ fontSize: 12, fontFamily: "JakartaSemiBold", color: colors.primary, marginBottom: 4 }}>
                    Your bid: ৳{(req.own_bid_price / 100).toFixed(0)}
                  </Text>
                )}

                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <Ionicons name="location" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginLeft: 6, flex: 1 }} numberOfLines={1}>
                    {req.pickup_address || "Pickup"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Ionicons name="flag" size={14} color={colors.danger} />
                  <Text style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary, marginLeft: 6, flex: 1 }} numberOfLines={1}>
                    {req.dropoff_address || "Dropoff"}
                  </Text>
                </View>

                {/* Cargo/option chips */}
                {(req.cargo_tags?.length ?? 0) > 0 || req.rental_options ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
                    {req.cargo_tags?.slice(0, 3).map((tag) => (
                      <View key={tag} style={{ backgroundColor: colors.blue + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, fontFamily: "JakartaMedium", color: colors.blue }}>{tag}</Text>
                      </View>
                    ))}
                    {req.rental_options?.split(",").slice(0, 2).map((opt) => (
                      <View key={opt} style={{ backgroundColor: colors.amber + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, fontFamily: "JakartaMedium", color: colors.amber }}>{opt.trim()}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary }}>
                    {new Date(req.created_at).toLocaleDateString("en-GB")}
                  </Text>
                  {req.urgency === "alarm" && (
                    <View style={{ backgroundColor: colors.danger + "18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontFamily: "JakartaSemiBold", color: colors.danger }}>ALARM</Text>
                    </View>
                  )}
                  {req.ambulance_eligible === false && (
                    <View style={{ backgroundColor: colors.amber + "18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontFamily: "JakartaSemiBold", color: colors.amber }}>CERT NEEDED</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
        {hasMore && (
          <TouchableOpacity
            onPress={loadMore}
            style={{ padding: 14, alignItems: "center" }}
          >
            <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: colors.primary }}>
              Load More
            </Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterPill({
  label,
  selected,
  onPress,
  textPrimary,
  borderColor,
  surfaceBg,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  textPrimary: string;
  borderColor: string;
  surfaceBg: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: selected ? colors.primary + "18" : surfaceBg,
        borderWidth: 1,
        borderColor: selected ? colors.primary : borderColor,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 8,
        marginRight: 8,
      }}
      accessibilityRole="button"
      accessibilityLabel={`Filter by ${label}`}
      accessibilityState={{ selected }}
    >
      <Text style={{
        fontSize: 13,
        fontFamily: selected ? "JakartaSemiBold" : "JakartaMedium",
        color: selected ? colors.primary : textPrimary,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
