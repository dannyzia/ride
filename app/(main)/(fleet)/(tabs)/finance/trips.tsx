/**
 * F09 — Fleet Trips list.
 * Reads from GET /api/fleet/trips?fleet_id=...
 * Filterable by status, paginated via FlatList (infinite scroll).
 * All money fields are integer paisa — divide by 100 at display.
 */
import { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useFleetStore } from "@/store/useFleetStore";
import FleetScreen from "@/components/fleet/FleetScreen";
import { getAuthHeaders } from "@/lib/fleetAuth";
import { logger } from "@/lib/logger";

interface Trip {
  id: string;
  rider_name: string | null;
  driver_id: string | null;
  vehicle_type: string;
  status: string;
  origin_address: string;
  destination_address: string;
  distance_km: string | null;
  rider_payable_bdt: number | null;
  tip_bdt: number | null;
  created_at: string;
  completed_at: string | null;
}

function formatPaisa(paisa: number | null): string {
  if (paisa == null) return "N/A";
  return `৳${(paisa / 100).toLocaleString("en-BD")}`;
}

function statusColor(status: string): string {
  switch (status) {
    case "completed": return colors.success;
    case "cancelled": return colors.danger;
    case "in_progress": return colors.primary;
    default: return colors.amber;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-BD", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_FILTERS = [
  { label: "All", value: undefined },
  { label: "Completed", value: "completed" },
  { label: "Active", value: "in_progress" },
  { label: "Cancelled", value: "cancelled" },
];

function TripCard({ trip, isDark, onPress }: { trip: Trip; isDark: boolean; onPress: () => void }) {
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const sc = statusColor(trip.status);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{
      backgroundColor: surfaceBg, borderRadius: 12, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor,
    }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sc, marginRight: 6 }} />
          <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 13, color: sc, textTransform: "capitalize" }}>
            {trip.status.replace(/_/g, " ")}
          </Text>
        </View>
        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 11, color: textSecondary }}>{formatDate(trip.created_at)}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 6 }}>
        <Ionicons name="ellipse" size={8} color={colors.primary} style={{ marginTop: 4, marginRight: 6 }} />
        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, flex: 1 }} numberOfLines={1}>{trip.origin_address}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 8 }}>
        <Ionicons name="location" size={8} color={colors.danger} style={{ marginTop: 4, marginRight: 6 }} />
        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary, flex: 1 }} numberOfLines={1}>{trip.destination_address}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 12, color: textSecondary }}>
          {trip.rider_name ?? "Rider"} · {trip.vehicle_type.replace(/_/g, " ")}
        </Text>
        <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 14, color: textPrimary }}>{formatPaisa(trip.rider_payable_bdt)}</Text>
      </View>
      {trip.distance_km && (
        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 11, color: textSecondary, marginTop: 2 }}>
          {Number(trip.distance_km).toFixed(1)} km
          {trip.tip_bdt && trip.tip_bdt > 0 ? ` · Tip ${formatPaisa(trip.tip_bdt)}` : ""}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function FleetTrips() {
  const isDark = useIsDark();
  const router = useRouter();
  const fleetId = useFleetStore((s) => s.activeFleetId);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  const fetchTrips = useCallback(async (pageNum: number, append: boolean) => {
    if (!fleetId) return;
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      const params = new URLSearchParams({ fleet_id: fleetId, page: String(pageNum), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`http://localhost:3000/api/fleet/trips?${params}`, { headers: authHeaders ?? {} });
      if (res.ok) {
        const data = await res.json();
        setTrips(prev => append ? [...prev, ...data.trips] : data.trips);
        setTotal(data.total ?? 0);
        setHasMore(data.trips?.length === 20);
      }
    } catch (err) { logger.error("[fleet-trips] fetch failed", err); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [fleetId, statusFilter]);

  useEffect(() => { setPage(1); fetchTrips(1, false); }, [fetchTrips]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    const next = page + 1; setPage(next); fetchTrips(next, true);
  };

  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <FleetScreen title="Trips" subtitle={`${total} total trips`} scrollable={false}>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16, paddingHorizontal: 16 }}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity key={f.label} onPress={() => setStatusFilter(f.value)} style={{
            paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
            backgroundColor: statusFilter === f.value ? colors.primary : isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
            borderWidth: 1, borderColor: statusFilter === f.value ? colors.primary : isDark ? colors.borderDark : colors.borderLight,
          }}>
            <Text style={{
              fontFamily: statusFilter === f.value ? "Jakarta-Bold" : "Jakarta-Medium", fontSize: 12,
              color: statusFilter === f.value ? colors.white : textSecondary,
            }}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && trips.length === 0 ? (
        <View style={{ alignItems: "center", paddingTop: 40 }}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={trips} keyExtractor={t => t.id}
          renderItem={({ item }) => (
            <TripCard trip={item} isDark={isDark} onPress={() =>
              router.push(`/(main)/(fleet)/trips/${item.id}?fleet_id=${fleetId}`)
            } />
          )}
          onEndReached={loadMore} onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 16 }} /> : null}
          ListEmptyComponent={<Text style={{ fontFamily: "Jakarta-Medium", fontSize: 14, color: textSecondary, textAlign: "center", paddingTop: 40 }}>No trips found</Text>}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        />
      )}
    </FleetScreen>
  );
}
