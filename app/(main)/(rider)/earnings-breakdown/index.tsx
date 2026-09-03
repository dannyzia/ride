import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { formatBDT } from "@/lib/format";
import { useTranslation } from "react-i18next";

interface TripRow {
  ride_id: string;
  completed_at: string;
  fare_bdt: number;
  driver_fare_bdt: number;
  distance_km: number;
  origin_address: string;
  destination_address: string;
}

const DATE_RANGES = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
] as const;

export default function EarningsBreakdown() {
  const { t } = useTranslation();  const [trips, setTrips] = useState<TripRow[]>([]);
  const [totalEarningsBdt, setTotalEarningsBdt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState<"week" | "month">("week");

  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setError("Not authenticated");
          return;
        }
        const res = await fetch(
          `${API_URL}/api/driver/earnings/breakdown?range=${dateRange}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed");
          return;
        }
        setTrips(data.trips ?? []);
        setTotalEarningsBdt(data.total_earnings_bdt ?? 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
        logger.error("EarningsBreakdown fetch failed", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateRange],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalKm = trips.reduce((s, t) => s + t.distance_km, 0);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="flex-row items-center px-[24px] py-[16px] border-b"
        style={{ borderBottomColor: borderColor }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-[12px] p-[4px]"
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="flex-1 text-center text-[18px] font-JakartaBold"
          style={{ color: textPrimary }}
        >
          Earnings Breakdown
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Date range selector */}
      <View
        className="flex-row px-[24px] py-[12px] gap-2"
        style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}
      >
        {DATE_RANGES.map((r) => {
          const active = dateRange === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              onPress={() => setDateRange(r.key)}
              className="px-[14px] py-[7px] rounded-full"
              style={{
                backgroundColor: active ? colors.primary : surfaceBg,
                borderWidth: 1,
                borderColor: active ? colors.primary : borderColor,
              }}
            >
              <Text
                className="text-[13px] font-JakartaSemiBold"
                style={{ color: active ? colors.white : textPrimary }}
              >
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 40 }}
        />
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text
            className="text-[14px] font-Jakarta text-center mb-4"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
          <TouchableOpacity
            className="rounded-full px-[24px] py-[12px]"
            style={{ backgroundColor: colors.primary }}
            onPress={() => fetchData()}
          >
            <Text className="text-[16px] font-JakartaBold text-white">
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : trips.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Ionicons name="car-outline" size={48} color={textSecondary} />
          <Text
            className="text-[15px] font-Jakarta mt-3 text-center"
            style={{ color: textSecondary }}
          >
            No trips {dateRange === "week" ? "this week" : "this month"}
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-[24px]"
          contentContainerStyle={{ paddingVertical: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(true)}
              colors={[colors.primary]}
            />
          }
        >
          {/* Summary card */}
          <View
            className="p-[14px] rounded-[12px] mb-4"
            style={{
              backgroundColor: isDark
                ? colors.primaryLightDark
                : colors.primaryLight,
            }}
          >
            <Text
              className="text-[13px] font-Jakarta"
              style={{ color: textSecondary }}
            >
              Total earnings
            </Text>
            <Text
              className="text-[24px] font-JakartaBold tracking-tight"
              style={{ color: colors.primary }}
            >
              {formatBDT(totalEarningsBdt)}
            </Text>
            <Text
              className="text-[13px] font-Jakarta mt-1"
              style={{ color: textSecondary }}
            >
              {trips.length} trips · {totalKm.toFixed(1)} km
            </Text>
          </View>

          {/* Trip list */}
          {trips.map((t) => (
            <View
              key={t.ride_id}
              className="flex-row justify-between items-center p-[14px] border rounded-[12px] mb-2"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <View className="flex-1">
                <Text
                  className="text-[14px] font-JakartaBold"
                  style={{ color: textPrimary }}
                  numberOfLines={1}
                >
                  {t.origin_address || "Pickup"}
                </Text>
                <Text
                  className="text-[12px] font-Jakarta mt-0.5"
                  style={{ color: textSecondary }}
                >
                  {new Date(t.completed_at).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                  })}{" "}
                  · {t.distance_km.toFixed(1)} km
                </Text>
              </View>
              <Text
                className="text-[15px] font-JakartaBold ml-2"
                style={{ color: textPrimary }}
              >
                {formatBDT(t.driver_fare_bdt)}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
