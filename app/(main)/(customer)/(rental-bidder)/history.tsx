/**
 * Fleet bid history — shows all settled bids (won, lost, withdrawn, expired).
 * Multi-fleet labeled (F30).
 *
 * Route: /(rental-bidder)/history
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
  won: "#0CC25F",
  lost: "#EF4444",
  withdrawn: "#9CA3AF",
  expired: "#9CA3AF",
  superseded: "#F59E0B",
};

interface BidHistory {
  id: string;
  request_id: string;
  fleet_id: string;
  vehicle_type: string;
  quoted_price_bdt: number;
  quoted_notes: string | null;
  status: string;
  submitted_at: string;
  settled_at: string | null;
}

export default function BidHistoryScreen() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const [bids, setBids] = useState<BidHistory[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${SERVER_URL}/api/rental/bids/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBids(data.bids ?? []);
      }
    } catch (err) {
      logger.error("[bid-history] fetch error", err);
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
          Bid History
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {bids.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Ionicons name="time-outline" size={48} color={textSecondary} />
            <Text style={{ fontSize: 15, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12 }}>
              No bid history yet
            </Text>
          </View>
        ) : (
          bids.map((bid) => {
            const statusColor = STATUS_COLORS[bid.status] ?? textSecondary;
            return (
              <View
                key={bid.id}
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
                  <Text style={{ fontSize: 16, fontFamily: "JakartaBold", color: colors.primary }}>
                    ৳{(bid.quoted_price_bdt / 100).toFixed(0)}
                  </Text>
                  <View style={{ backgroundColor: statusColor + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontFamily: "JakartaSemiBold", color: statusColor }}>
                      {bid.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary }}>
                  {bid.vehicle_type.replace(/_/g, " ")}
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 4 }}>
                  Submitted: {new Date(bid.submitted_at).toLocaleString("en-GB")}
                </Text>
                {bid.settled_at && (
                  <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary }}>
                    Settled: {new Date(bid.settled_at).toLocaleString("en-GB")}
                  </Text>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
