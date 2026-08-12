import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import { colors, spacing, radii } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";

type RideStatus = "completed" | "cancelled" | "no_show" | "disputed" | "in_progress";

interface RideItem {
  id: string;
  created_at: string;
  status: RideStatus;
  origin_address: string;
  destination_address: string;
  fare_bdt: number;
  final_fare_bdt: number | null;
  driver_name: string;
  driver_avatar: string | null;
  driver_rating: number;
  vehicle_type: string;
  vehicle_plate: string;
  payment_method: string;
  cancelled_by?: "rider" | "driver";
  cancellation_reason?: string;
  dispute_status?: string;
  tip_bdt: number;
}

type FilterTab = "all" | "completed" | "cancelled" | "disputed";

interface DateGroup {
  title: string;
  data: RideItem[];
}

export default function RidesScreen() {
  const [rides, setRides] = useState<RideItem[]>([]);
  const [filteredRides, setFilteredRides] = useState<RideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRide, setSelectedRide] = useState<RideItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const fetchRides = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/ride/history`);
      if (!res.ok) throw new Error("Failed to fetch rides");
      const data = await res.json();
      setRides(data.rides || []);
    } catch (e) {
      logger.error("[rides] fetch failed", e);
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
        if (activeFilter === "cancelled") return r.status === "cancelled" || r.status === "no_show";
        if (activeFilter === "disputed") return r.status === "disputed";
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

  const getStatusColor = (status: RideStatus) => {
    switch (status) {
      case "completed":
        return { bg: colors.primaryLight, text: colors.primary };
      case "cancelled":
      case "no_show":
        return { bg: colors.dangerLight, text: colors.danger };
      case "disputed":
        return { bg: colors.amber + "20", text: colors.amber };
      case "in_progress":
        return { bg: colors.info + "20", text: colors.info };
      default:
        return { bg: isDark ? colors.darkSecondary : colors.gray100, text: textSecondary };
    }
  };

  const getStatusLabel = (status: RideStatus) => {
    switch (status) {
      case "completed": return "Completed";
      case "cancelled": return "Cancelled";
      case "no_show": return "No Show";
      case "disputed": return "Disputed";
      case "in_progress": return "In Progress";
      default: return status;
    }
  };

  const groupByDate = (items: RideItem[]): DateGroup[] => {
    const groups: Record<string, RideItem[]> = {};
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now.setDate(now.getDate() - 1)).toDateString();

    items.forEach((item) => {
      const d = new Date(item.created_at);
      const dateStr = d.toDateString();
      let key: string;
      if (dateStr === today) key = "Today";
      else if (dateStr === yesterday) key = "Yesterday";
      else if (d > new Date(Date.now() - 7 * 86400000)) key = "This Week";
      else if (d > new Date(Date.now() - 30 * 86400000)) key = "This Month";
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
              vehicle_type: ride.vehicle_type,
            },
          });
        },
      },
    ]);
  };

  const handleDispute = (ride: RideItem) => {
    if (ride.status === "disputed") {
      Alert.alert("Dispute Status", `Current status: ${ride.dispute_status || "Under review"}`);
      return;
    }
    Alert.alert("Dispute Fare?", "Are you sure you want to dispute this ride's fare?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Dispute",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/api/ride/${ride.id}/dispute`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: "Fare discrepancy" }),
            });
            if (res.ok) {
              Alert.alert("Dispute Filed", "We'll review your case within 24 hours.");
              fetchRides();
            } else {
              Alert.alert("Error", "Could not file dispute.");
            }
          } catch {
            Alert.alert("Error", "Network error.");
          }
        },
      },
    ]);
  };

  const renderRideCard = ({ item }: { item: RideItem }) => {
    const statusStyle = getStatusColor(item.status);
    const isCompleted = item.status === "completed";

    return (
      <TouchableOpacity
        style={[styles.rideCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}
        onPress={() => {
          setSelectedRide(item);
          setDetailModalVisible(true);
        }}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardDate, { color: textSecondary }]}>
            {new Date(item.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
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
                {item.driver_name}
              </Text>
              <Text style={[styles.vehicleInfo, { color: textSecondary }]}>
                {item.vehicle_type} · {item.vehicle_plate}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.fareText, { color: textPrimary }]}>
              ৳{((item.final_fare_bdt ?? item.fare_bdt) / 100).toFixed(0)}
            </Text>
            {item.tip_bdt > 0 && (
              <Text style={[styles.tipText, { color: colors.primary }]}>
                +৳{(item.tip_bdt / 100).toFixed(0)} tip
              </Text>
            )}
          </View>
        </View>

        {isCompleted && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}
              onPress={() => handleRebook(item)}
            >
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: textPrimary }]}>Rebook</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]}
              onPress={() => handleDispute(item)}
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
    const statusStyle = getStatusColor(selectedRide.status);

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
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.modalStatus, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.modalStatusText, { color: statusStyle.text }]}>
                  {getStatusLabel(selectedRide.status)}
                </Text>
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

              <View style={[styles.fareBreakdown, { borderColor: borderColor }]}>
                <View style={styles.fareRow}>
                  <Text style={[styles.fareLabel, { color: textSecondary }]}>Base Fare</Text>
                  <Text style={[styles.fareValue, { color: textPrimary }]}>
                    ৳{(selectedRide.fare_bdt / 100).toFixed(0)}
                  </Text>
                </View>
                {selectedRide.tip_bdt > 0 && (
                  <View style={styles.fareRow}>
                    <Text style={[styles.fareLabel, { color: textSecondary }]}>Tip</Text>
                    <Text style={[styles.fareValue, { color: colors.primary }]}>
                      +৳{(selectedRide.tip_bdt / 100).toFixed(0)}
                    </Text>
                  </View>
                )}
                <View style={[styles.fareRow, styles.fareTotal, { borderTopColor: borderColor }]}>
                  <Text style={[styles.fareTotalLabel, { color: textPrimary }]}>Total Paid</Text>
                  <Text style={[styles.fareTotalValue, { color: colors.primary }]}>
                    ৳{((selectedRide.final_fare_bdt ?? selectedRide.fare_bdt) / 100).toFixed(0)}
                  </Text>
                </View>
              </View>

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
                  <Text style={[styles.driverName, { color: textPrimary }]}>{selectedRide.driver_name}</Text>
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color={colors.amber} />
                    <Text style={[styles.ratingText, { color: textSecondary }]}>
                      {selectedRide.driver_rating.toFixed(1)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.vehicleInfo, { color: textSecondary }]}>
                  {selectedRide.vehicle_type}
                </Text>
              </View>

              <View style={styles.paymentRow}>
                <Ionicons name="cash" size={20} color={colors.greenVariant} />
                <Text style={[styles.paymentText, { color: textPrimary }]}>
                  Paid with {selectedRide.payment_method || "Cash"}
                </Text>
              </View>

              <Text style={[styles.receiptDate, { color: textDisabled }]}>
                {new Date(selectedRide.created_at).toLocaleString("en-GB", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    setDetailModalVisible(false);
                    handleRebook(selectedRide);
                  }}
                >
                  <Text style={styles.modalActionText}>Rebook This Route</Text>
                </TouchableOpacity>
                {selectedRide.status === "completed" && (
                  <TouchableOpacity
                    style={[styles.modalActionBtnSecondary, { borderColor: borderColor }]}
                    onPress={() => handleDispute(selectedRide)}
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
        {activeFilter === "all"
          ? "Your ride history will appear here"
          : `No ${activeFilter} rides found`}
      </Text>
      <TouchableOpacity
        style={[styles.bookBtn, { backgroundColor: colors.primary }]}
        onPress={() => router.push("/(main)/(customer)/(tabs)/home")}
      >
        <Text style={styles.bookBtnText}>Book a Ride</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSectionHeader = (title: string) => (
    <Text style={[styles.sectionHeader, { color: textSecondary }]}>{title}</Text>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Your Rides</Text>
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
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={textDisabled} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {(["all", "completed", "cancelled", "disputed"] as FilterTab[]).map((tab) => (
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
          >
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 13,
                color: activeFilter === tab ? colors.white : textSecondary,
              }}
            >
              {tab === "all" ? "All" : tab === "completed" ? "Completed" : tab === "cancelled" ? "Cancelled" : "Disputed"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredRides.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={groupedRides}
          keyExtractor={(item) => item.title}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item: group }) => (
            <View>
              {renderSectionHeader(group.title)}
              {group.data.map((ride) => (
                <View key={ride.id} style={{ marginHorizontal: 16, marginBottom: 12 }}>
                  {renderRideCard({ item: ride })}
                </View>
              ))}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}

      {renderDetailModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
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
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    shadowColor: "#000",
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
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  statusText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
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
  tipText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
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
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
    marginBottom: 16,
  },
  modalStatusText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
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
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  paymentText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
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
