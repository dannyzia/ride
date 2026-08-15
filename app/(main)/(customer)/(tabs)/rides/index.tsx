import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  RefreshControl,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Image,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import { colors, radii } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { formatBDT, formatDateTime } from "@/lib/format";
import StatusBadge from "@/components/plan03/StatusBadge";
import RideCardSkeleton from "@/components/plan03/RideCardSkeleton";

type BadgeStatus = "completed" | "cancelled" | "in_progress" | "scheduled";

interface RideApiDriver {
  driver_id: string | null;
  full_name: string | null;
  profile_image_url: string | null;
  rating: number | null;
}

interface RideApiRow {
  ride_id: string;
  origin_address: string | null;
  destination_address: string | null;
  origin_latitude: string | null;
  origin_longitude: string | null;
  destination_latitude: string | null;
  destination_longitude: string | null;
  created_at: string | null;
  status: string;
  scheduled_at: string | null;
  completed_at: string | null;
  vehicle_type: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  driver_id: string | null;
  fare_breakdown: {
    total_bdt?: number | null;
    base_fare_bdt?: number | null;
    distance_charge_bdt?: number | null;
    time_charge_bdt?: number | null;
    surge_fee_bdt?: number | null;
  } | null;
  driver: RideApiDriver | null;
}

interface RideItem {
  id: string;
  created_at: string | null;
  completed_at: string | null;
  status: string;
  origin_address: string;
  destination_address: string;
  origin_lat: number | null;
  origin_lng: number | null;
  dest_lat: number | null;
  dest_lng: number | null;
  vehicle_type: string;
  cancel_reason: string | null;
  cancelled_by: string | null;
  fare_bdt: number;
  fare_base_bdt: number | null;
  fare_distance_bdt: number | null;
  fare_time_bdt: number | null;
  fare_surge_bdt: number | null;
  driver_name: string | null;
  driver_avatar: string | null;
  driver_rating: number | null;
}

type FilterTab = "all" | "completed" | "cancelled";

interface DateGroup {
  title: string;
  data: RideItem[];
}

const FILTER_LABELS: Record<FilterTab, string> = {
  all: "All",
  completed: "Completed",
  cancelled: "Cancelled",
};

const toPaisa = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const parseCoord = (value: string | null | undefined): number | null => {
  const n = value == null ? NaN : parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

// Bucket keys in Asia/Dhaka so date grouping matches the displayed dates (lib/format.ts).
const dhakaDateKey = (d: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const toBadgeStatus = (status: string): BadgeStatus => {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in_progress";
  if (status === "cancelled") return "cancelled";
  if (status === "expired" || status === "no_drivers") return "cancelled";
  if (status === "scheduled") return "scheduled";
  return "in_progress";
};

const mapRideRow = (row: RideApiRow): RideItem => ({
  id: row.ride_id,
  created_at: row.created_at ?? null,
  completed_at: row.completed_at ?? null,
  status: row.status,
  origin_address: row.origin_address ?? "",
  destination_address: row.destination_address ?? "",
  origin_lat: parseCoord(row.origin_latitude),
  origin_lng: parseCoord(row.origin_longitude),
  dest_lat: parseCoord(row.destination_latitude),
  dest_lng: parseCoord(row.destination_longitude),
  vehicle_type: row.vehicle_type ?? "",
  cancel_reason: row.cancel_reason ?? null,
  cancelled_by: row.cancelled_by ?? null,
  fare_bdt: toPaisa(row.fare_breakdown?.total_bdt) ?? 0,
  fare_base_bdt: toPaisa(row.fare_breakdown?.base_fare_bdt),
  fare_distance_bdt: toPaisa(row.fare_breakdown?.distance_charge_bdt),
  fare_time_bdt: toPaisa(row.fare_breakdown?.time_charge_bdt),
  fare_surge_bdt: toPaisa(row.fare_breakdown?.surge_fee_bdt),
  driver_name: row.driver?.full_name ?? null,
  driver_avatar: row.driver?.profile_image_url ?? null,
  driver_rating: row.driver?.rating ?? null,
});

export default function RidesScreen() {
  const [rides, setRides] = useState<RideItem[]>([]);
  const [filteredRides, setFilteredRides] = useState<RideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRide, setSelectedRide] = useState<RideItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const fetchRides = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`${API_URL}/api/ride/get-all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows: RideApiRow[] = Array.isArray(json?.data) ? json.data : [];
      setRides(rows.map(mapRideRow));
      setFetchError(false);
    } catch (e) {
      logger.error("[rides] fetch failed", e);
      setRides([]);
      setFetchError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  useEffect(() => {
    let result = rides;
    if (activeFilter !== "all") {
      result = result.filter((r) => {
        if (activeFilter === "completed") return r.status === "completed";
        if (activeFilter === "cancelled")
          return r.status === "cancelled" || r.status === "expired" || r.status === "no_drivers";
        return true;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.origin_address.toLowerCase().includes(q) ||
          r.destination_address.toLowerCase().includes(q) ||
          r.vehicle_type.toLowerCase().includes(q)
      );
    }
    setFilteredRides(result);
  }, [rides, activeFilter, searchQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRides();
  };

  const groupByDate = (items: RideItem[]): DateGroup[] => {
    const groups: Record<string, RideItem[]> = {};
    const now = Date.now();
    const todayKey = dhakaDateKey(new Date(now));
    const yesterdayKey = dhakaDateKey(new Date(now - 86400000));
    const weekAgo = now - 7 * 86400000;
    const monthAgo = now - 30 * 86400000;

    items.forEach((item) => {
      const d = new Date(item.created_at ?? "");
      const valid = Number.isFinite(d.getTime());
      let key: string;
      if (!valid) key = "Earlier";
      else if (dhakaDateKey(d) === todayKey) key = "Today";
      else if (dhakaDateKey(d) === yesterdayKey) key = "Yesterday";
      else if (d.getTime() > weekAgo) key = "This Week";
      else if (d.getTime() > monthAgo) key = "This Month";
      else key = "Earlier";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const order = ["Today", "Yesterday", "This Week", "This Month", "Earlier"];
    return order
      .filter((k) => groups[k]?.length)
      .map((k) => ({ title: k, data: groups[k] }));
  };

  const handleRebook = (ride: RideItem) => {
    Alert.alert("Rebook Ride?", `Book the same route to ${ride.destination_address}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Rebook",
        onPress: () => {
          router.push({
            pathname: "/(main)/(customer)/(tabs)/home",
            params: {
              rebook_origin: ride.origin_address,
              rebook_dest: ride.destination_address,
              rebook_origin_lat: ride.origin_lat?.toString() ?? "",
              rebook_origin_lng: ride.origin_lng?.toString() ?? "",
              rebook_dest_lat: ride.dest_lat?.toString() ?? "",
              rebook_dest_lng: ride.dest_lng?.toString() ?? "",
              vehicle_type: ride.vehicle_type,
            },
          });
        },
      },
    ]);
  };

  const handleDispute = (ride: RideItem) => {
    if (ride.fare_bdt <= 0) {
      Alert.alert("Error", "No fare on record to dispute.");
      return;
    }
    router.push(`/(main)/(customer)/fare-dispute?rideId=${ride.id}`);
  };

  const renderRideCard = ({ item }: { item: RideItem }) => {
    const isCompleted = item.status === "completed";

    return (
      <TouchableOpacity
        style={[styles.rideCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}
        onPress={() => {
          setSelectedRide(item);
          setDetailModalVisible(true);
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Ride to ${item.destination_address}`}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardDate, { color: textSecondary }]}>
            {formatDateTime(item.created_at)}
          </Text>
          <StatusBadge status={toBadgeStatus(item.status)} size="sm" />
        </View>

        <View style={styles.routeRow}>
          <View style={styles.routeLine}>
            <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
            <View style={[styles.routeConnector, { backgroundColor: borderColor }]} />
            <View style={[styles.routeDot, { backgroundColor: colors.danger }]} />
          </View>
          <View style={styles.routeTextCol}>
            <Text style={[styles.routeText, { color: textPrimary }]} numberOfLines={1}>
              {item.origin_address}
            </Text>
            <Text style={[styles.routeText, { color: textPrimary }]} numberOfLines={1}>
              {item.destination_address}
            </Text>
          </View>
        </View>

        <View style={[styles.cardFooter, { borderTopColor: borderColor }]}>
          <View style={styles.driverInfo}>
            <View style={[styles.driverAvatar, { backgroundColor: colors.primary + "20" }]}>
              {item.driver_avatar ? (
                <Image source={{ uri: item.driver_avatar }} style={styles.avatarImg} />
              ) : (
                <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                  {item.driver_name?.[0]?.toUpperCase() || "D"}
                </Text>
              )}
            </View>
            <View>
              <Text style={[styles.driverName, { color: textPrimary }]} numberOfLines={1}>
                {item.driver_name ?? "No driver assigned"}
              </Text>
              <Text style={[styles.vehicleInfo, { color: textSecondary }]} numberOfLines={1}>
                {item.vehicle_type}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.fareText, { color: textPrimary }]}>{formatBDT(item.fare_bdt)}</Text>
          </View>
        </View>

        {isCompleted && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}
              onPress={() => handleRebook(item)}
              accessibilityRole="button"
              accessibilityLabel="Rebook ride"
            >
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: textPrimary }]}>Rebook</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}
              onPress={() => handleDispute(item)}
              accessibilityRole="button"
              accessibilityLabel="Dispute fare"
            >
              <Ionicons name="flag" size={16} color={colors.danger} />
              <Text style={[styles.actionBtnText, { color: colors.danger }]}>Dispute</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderDetailModal = () => {
    if (!selectedRide) return null;

    return (
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
          <View style={[styles.modalContent, { backgroundColor: surfaceBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textPrimary }]}>Ride Receipt</Text>
              <TouchableOpacity
                onPress={() => setDetailModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close receipt"
              >
                <Ionicons name="close" size={24} color={textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalStatus}>
                <StatusBadge status={toBadgeStatus(selectedRide.status)} size="md" />
              </View>

              <View style={styles.modalRoute}>
                <View style={styles.routeLine}>
                  <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
                  <View style={[styles.routeConnector, { backgroundColor: borderColor }]} />
                  <View style={[styles.routeDot, { backgroundColor: colors.danger }]} />
                </View>
                <View style={styles.routeTextCol}>
                  <Text style={[styles.modalRouteText, { color: textPrimary }]}>
                    {selectedRide.origin_address}
                  </Text>
                  <Text style={[styles.modalRouteText, { color: textPrimary }]}>
                    {selectedRide.destination_address}
                  </Text>
                </View>
              </View>

              {selectedRide.status === "cancelled" && selectedRide.cancelled_by && (
                <Text style={[styles.cancelledByText, { color: textSecondary }]}>
                  Cancelled by {selectedRide.cancelled_by}
                </Text>
              )}
              {selectedRide.status === "cancelled" && selectedRide.cancel_reason && (
                <Text style={[styles.cancelledByText, { color: textSecondary }]}>
                  Reason: {selectedRide.cancel_reason}
                </Text>
              )}

              <View style={[styles.fareBreakdown, { borderColor: borderColor }]}>
                {selectedRide.fare_base_bdt !== null && (
                  <View style={styles.fareRow}>
                    <Text style={[styles.fareLabel, { color: textSecondary }]}>Base Fare</Text>
                    <Text style={[styles.fareValue, { color: textPrimary }]}>
                      {formatBDT(selectedRide.fare_base_bdt)}
                    </Text>
                  </View>
                )}
                {selectedRide.fare_distance_bdt !== null && (
                  <View style={styles.fareRow}>
                    <Text style={[styles.fareLabel, { color: textSecondary }]}>Distance</Text>
                    <Text style={[styles.fareValue, { color: textPrimary }]}>
                      {formatBDT(selectedRide.fare_distance_bdt)}
                    </Text>
                  </View>
                )}
                {selectedRide.fare_time_bdt !== null && (
                  <View style={styles.fareRow}>
                    <Text style={[styles.fareLabel, { color: textSecondary }]}>Time</Text>
                    <Text style={[styles.fareValue, { color: textPrimary }]}>
                      {formatBDT(selectedRide.fare_time_bdt)}
                    </Text>
                  </View>
                )}
                {selectedRide.fare_surge_bdt !== null && selectedRide.fare_surge_bdt > 0 && (
                  <View style={styles.fareRow}>
                    <Text style={[styles.fareLabel, { color: textSecondary }]}>Surge</Text>
                    <Text style={[styles.fareValue, { color: textPrimary }]}>
                      {formatBDT(selectedRide.fare_surge_bdt)}
                    </Text>
                  </View>
                )}
                <View style={[styles.fareRow, styles.fareTotal, { borderTopColor: borderColor }]}>
                  <Text style={[styles.fareTotalLabel, { color: textPrimary }]}>Total Fare</Text>
                  <Text style={[styles.fareTotalValue, { color: colors.primary }]}>
                    {formatBDT(selectedRide.fare_bdt)}
                  </Text>
                </View>
              </View>

              {selectedRide.driver_name && (
                <View style={[styles.driverDetail, { borderColor: borderColor }]}>
                  <View style={[styles.driverAvatar, { backgroundColor: colors.primary + "20" }]}>
                    {selectedRide.driver_avatar ? (
                      <Image source={{ uri: selectedRide.driver_avatar }} style={styles.avatarImg} />
                    ) : (
                      <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                        {selectedRide.driver_name?.[0]?.toUpperCase() || "D"}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.driverName, { color: textPrimary }]}>
                      {selectedRide.driver_name}
                    </Text>
                    {typeof selectedRide.driver_rating === "number" && (
                      <View style={styles.ratingRow}>
                        <Ionicons name="star" size={14} color={colors.amber} />
                        <Text style={[styles.ratingText, { color: textSecondary }]}>
                          {selectedRide.driver_rating.toFixed(1)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.vehicleInfo, { color: textSecondary }]}>
                    {selectedRide.vehicle_type}
                  </Text>
                </View>
              )}

              <Text style={[styles.receiptDate, { color: textDisabled }]}>
                {formatDateTime(selectedRide.created_at)}
              </Text>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    setDetailModalVisible(false);
                    handleRebook(selectedRide);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Rebook this route"
                >
                  <Text style={styles.modalActionText}>Rebook This Route</Text>
                </TouchableOpacity>
                {selectedRide.status === "completed" && (
                  <TouchableOpacity
                    style={[styles.modalActionBtnSecondary, { borderColor: borderColor }]}
                    onPress={() => handleDispute(selectedRide)}
                    accessibilityRole="button"
                    accessibilityLabel="File fare dispute"
                  >
                    <Text style={[styles.modalActionTextSecondary, { color: textPrimary }]}>
                      File Dispute
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const groupedRides = groupByDate(filteredRides);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="car-outline" size={64} color={textDisabled} />
      <Text style={[styles.emptyTitle, { color: textPrimary }]}>No rides yet</Text>
      <Text style={[styles.emptySub, { color: textSecondary }]}>
        {searchQuery.trim()
          ? "No rides match your search"
          : activeFilter === "all"
            ? "Your ride history will appear here"
            : `No ${FILTER_LABELS[activeFilter].toLowerCase()} rides found`}
      </Text>
      <TouchableOpacity
        style={[styles.bookBtn, { backgroundColor: colors.primary }]}
        onPress={() => router.push("/(main)/(customer)/(tabs)/home")}
        accessibilityRole="button"
        accessibilityLabel="Book a ride"
      >
        <Text style={styles.bookBtnText}>Book a Ride</Text>
      </TouchableOpacity>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="warning-outline" size={48} color={colors.danger} />
      <Text style={[styles.emptyTitle, { color: textPrimary }]}>Could not load rides</Text>
      <Text style={[styles.emptySub, { color: textSecondary }]}>Pull down to retry</Text>
    </View>
  );

  const renderSectionHeader = (title: string) => (
    <Text style={[styles.sectionHeader, { color: textSecondary, backgroundColor: bg }]}>{title}</Text>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Your Rides</Text>
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

      <View style={[styles.searchBar, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
        <Ionicons name="search" size={18} color={textDisabled} />
        <TextInput
          style={[styles.searchInput, { color: textPrimary }]}
          placeholder="Search rides..."
          placeholderTextColor={textDisabled}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery("")}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={textDisabled} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {(Object.keys(FILTER_LABELS) as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.filterBtn,
              {
                backgroundColor: activeFilter === tab ? colors.primary : isDark ? colors.darkSecondary : colors.gray100,
                borderColor: activeFilter === tab ? colors.primary : borderColor,
              },
            ]}
            onPress={() => setActiveFilter(tab)}
            accessibilityRole="button"
            accessibilityLabel={`Filter ${FILTER_LABELS[tab]}`}
          >
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 13,
                color: activeFilter === tab ? colors.white : textSecondary,
              }}
            >
              {FILTER_LABELS[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.skeletonList}>
          <RideCardSkeleton />
          <RideCardSkeleton />
          <RideCardSkeleton />
        </View>
      ) : (
        <SectionList
          sections={groupedRides.map((g) => ({ title: g.title, data: g.data }))}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={fetchError ? renderErrorState() : renderEmptyState()}
          renderSectionHeader={({ section }) => renderSectionHeader(section.title)}
          renderItem={({ item }) => (
            <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
              {renderRideCard({ item })}
            </View>
          )}
          contentContainerStyle={groupedRides.length === 0 ? { flexGrow: 1 } : { paddingBottom: 24 }}
        />
      )}

      {renderDetailModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Jakarta-Regular",
    fontSize: 15,
    paddingVertical: 4,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  skeletonList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 20,
    marginTop: 16,
  },
  emptySub: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  bookBtn: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 100,
  },
  bookBtnText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
    color: colors.white,
  },
  sectionHeader: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  rideCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardDate: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
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
    gap: 8,
  },
  routeText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
  },
  driverInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { fontFamily: "Jakarta-Bold", fontSize: 16 },
  driverName: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
  },
  vehicleInfo: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginTop: 2,
  },
  fareText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  actionBtnText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: "85%",
    minHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 20,
  },
  modalStatus: {
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  modalRoute: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  modalRouteText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  cancelledByText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginBottom: 12,
  },
  fareBreakdown: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
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
  fareTotal: {
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
  driverDetail: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  receiptDate: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 20,
  },
  modalActions: {
    gap: 10,
  },
  modalActionBtn: {
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: "center",
  },
  modalActionText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
    color: colors.white,
  },
  modalActionBtnSecondary: {
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1.5,
  },
  modalActionTextSecondary: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
  },
});
