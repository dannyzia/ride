/**
 * Rental bidding screen — shows live bids in low→high order with rank badges.
 * Customer accepts any bid at any time (§1.1 ruling).
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
import { useRentalStore } from "@/store/useRentalStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

const RANK_COLORS: Record<string, string> = {
  Best: "#0CC25F",
  "2nd": "#3B82F6",
  "3rd": "#F59E0B",
};

export default function BiddingScreen() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { activeRequest, bids, setBids, selectedBidId, setSelectedBidId } =
    useRentalStore();
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const fetchBids = useCallback(async () => {
    if (!activeRequest) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(
        `${SERVER_URL}/api/rental/requests/${activeRequest.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const data = await res.json();
      setBids(data.bids ?? []);
    } catch (err) {
      logger.error("[bidding] fetch error", err);
    }
  }, [activeRequest?.id]);

  useEffect(() => {
    fetchBids();
    const interval = setInterval(fetchBids, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [fetchBids]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBids();
    setRefreshing(false);
  };

  const handleAccept = async () => {
    if (!selectedBidId || !activeRequest) return;
    setAccepting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(
        `${SERVER_URL}/api/rental/requests/${activeRequest.id}/accept-bid`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ bid_id: selectedBidId }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Could not accept bid");
        return;
      }

      router.replace("/(main)/(customer)/(rental-marketplace)/confirmed");
    } catch (err) {
      logger.error("[bidding] accept error", err);
    } finally {
      setAccepting(false);
    }
  };

  // Time remaining
  const deadline = activeRequest
    ? new Date(activeRequest.soft_deadline_at).getTime() - Date.now()
    : 0;
  const minutesLeft = Math.max(0, Math.floor(deadline / 60000));
  const secondsLeft = Math.max(0, Math.floor((deadline % 60000) / 1000));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          Bids ({bids.length})
        </Text>
        {deadline > 0 && (
          <View style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, fontFamily: "JakartaSemiBold", color: textPrimary }}>
              {minutesLeft}:{String(secondsLeft).padStart(2, "0")}
            </Text>
          </View>
        )}
      </View>

      {/* Payment disclosure (plan v2 §8) */}
      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        <View style={{ backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10 }}>
          <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: "#92400E" }}>
            Payment is made directly to the driver — not through the app.
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {bids.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 15, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12 }}>
              Waiting for bids...
            </Text>
          </View>
        ) : (
          bids.map((bid) => {
            const isSelected = selectedBidId === bid.id;
            return (
              <TouchableOpacity
                key={bid.id}
                onPress={() => setSelectedBidId(bid.id)}
                style={{
                  backgroundColor: surfaceBg,
                  borderWidth: 2,
                  borderColor: isSelected ? colors.primary : borderColor,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {/* Rank badge */}
                {bid.rank_badge && (
                  <View
                    style={{
                      backgroundColor: RANK_COLORS[bid.rank_badge] ?? "#6B7280",
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      marginRight: 12,
                    }}
                  >
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
                    {bid.vehicle_type.replace(/_/g, " ")}
                  </Text>
                  {bid.fleet_rating != null && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginLeft: 4 }}>
                        {bid.fleet_rating.toFixed(1)} · {bid.fleet_completed_count ?? 0} trips
                      </Text>
                    </View>
                  )}
                </View>

                {isSelected && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Accept button */}
      {selectedBidId && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: surfaceBg,
            borderTopWidth: 1,
            borderTopColor: borderColor,
            padding: 16,
          }}
        >
          <TouchableOpacity
            onPress={handleAccept}
            disabled={accepting}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              height: 52,
              alignItems: "center",
              justifyContent: "center",
            }}
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
