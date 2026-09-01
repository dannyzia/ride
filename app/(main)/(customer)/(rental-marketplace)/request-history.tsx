/**
 * Rental request history — customer's past requests with status badges.
 *
 * Route: /(rental-marketplace)/request-history
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

interface HistoryRequest {
  id: string;
  category: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  created_at: string;
  awarded_bid_id: string | null;
}

export default function RequestHistoryScreen() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const [requests, setRequests] = useState<HistoryRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${SERVER_URL}/api/rental/requests/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests ?? []);
      }
    } catch (err) {
      logger.error("[request-history] fetch error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  };

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
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          Request History
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {requests.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Ionicons name="time-outline" size={48} color={textSecondary} />
            <Text style={{ fontSize: 15, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12 }}>
              No requests yet
            </Text>
          </View>
        ) : (
          requests.map((req) => {
            const statusColor = STATUS_COLORS[req.status] ?? textSecondary;
            return (
              <TouchableOpacity
                key={req.id}
                onPress={() => router.push(`/(main)/(customer)/(rental-marketplace)/request-detail?id=${req.id}`)}
                style={{
                  backgroundColor: surfaceBg,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons
                      name={req.category === "truck_rental" ? "bus" : req.category === "ambulance_scheduled" ? "medkit" : "car-sport"}
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: textPrimary, marginLeft: 8 }}>
                      {CATEGORY_LABELS[req.category] ?? req.category}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: statusColor + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontFamily: "JakartaSemiBold", color: statusColor }}>
                      {req.status.replace(/_/g, " ").toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary }} numberOfLines={1}>
                  {req.pickup_address} → {req.dropoff_address}
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 4 }}>
                  {new Date(req.created_at).toLocaleDateString("en-GB")}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
