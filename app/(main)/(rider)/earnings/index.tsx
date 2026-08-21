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
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { formatBDT } from "@/lib/format";

interface DailyStats {
  earnings_bdt: number;
  trips: number;
  online_hours: number;
  rating: number | null;
  acceptance_rate: number | null;
}

export default function EarningsDashboard() {
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const fetchStats = useCallback(async (isRefresh = false) => {
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
      const res = await fetch(`${API_URL}/api/driver/daily-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Failed to load earnings");
        return;
      }
      setStats(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Fetch earnings failed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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
          Earnings
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        className="flex-1 px-[24px]"
        contentContainerStyle={{ paddingVertical: 16, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchStats(true)}
            colors={[colors.primary]}
          />
        }
      >
        {loading && !refreshing ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 40 }}
          />
        ) : error ? (
          <View className="items-center py-[40px]">
            <Ionicons
              name="alert-circle-outline"
              size={40}
              color={colors.danger}
            />
            <Text
              className="text-[14px] font-Jakarta mt-3 text-center"
              style={{ color: colors.danger }}
            >
              {error}
            </Text>
            <TouchableOpacity onPress={() => fetchStats()} className="mt-3">
              <Text
                className="text-[14px] font-JakartaBold"
                style={{ color: colors.primary }}
              >
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        ) : stats ? (
          <>
            {/* Today's earnings summary */}
            <View
              className="rounded-[12px] p-[16px]"
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
                Today&apos;s earnings
              </Text>
              <Text
                className="text-[28px] font-JakartaBold tracking-tight mt-1"
                style={{ color: colors.primary }}
              >
                {formatBDT(stats.earnings_bdt)}
              </Text>
              <View className="flex-row gap-4 mt-3">
                <View>
                  <Text
                    className="text-[12px] font-Jakarta"
                    style={{ color: textSecondary }}
                  >
                    Trips
                  </Text>
                  <Text
                    className="text-[16px] font-JakartaBold"
                    style={{ color: textPrimary }}
                  >
                    {stats.trips}
                  </Text>
                </View>
                <View>
                  <Text
                    className="text-[12px] font-Jakarta"
                    style={{ color: textSecondary }}
                  >
                    Online
                  </Text>
                  <Text
                    className="text-[16px] font-JakartaBold"
                    style={{ color: textPrimary }}
                  >
                    {Math.round(stats.online_hours * 10) / 10}h
                  </Text>
                </View>
                {stats.rating != null && (
                  <View>
                    <Text
                      className="text-[12px] font-Jakarta"
                      style={{ color: textSecondary }}
                    >
                      Rating
                    </Text>
                    <Text
                      className="text-[16px] font-JakartaBold"
                      style={{ color: textPrimary }}
                    >
                      ⭐ {stats.rating.toFixed(1)}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Navigation links */}
            <TouchableOpacity
              className="p-[14px] border rounded-[12px]"
              style={{ backgroundColor: surfaceBg, borderColor }}
              onPress={() =>
                router.push("/(main)/(rider)/earnings-breakdown")
              }
            >
              <View className="flex-row justify-between items-center">
                <View>
                  <Text
                    className="text-[15px] font-JakartaBold"
                    style={{ color: textPrimary }}
                  >
                    Earnings Breakdown
                  </Text>
                  <Text
                    className="text-[13px] font-Jakarta mt-1"
                    style={{ color: textSecondary }}
                  >
                    Trip-by-trip earnings details
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={textSecondary}
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              className="p-[14px] border rounded-[12px]"
              style={{ backgroundColor: surfaceBg, borderColor }}
              onPress={() =>
                router.push("/(main)/(rider)/commission-statement")
              }
            >
              <View className="flex-row justify-between items-center">
                <View>
                  <Text
                    className="text-[15px] font-JakartaBold"
                    style={{ color: textPrimary }}
                  >
                    Commission Statement
                  </Text>
                  <Text
                    className="text-[13px] font-Jakarta mt-1"
                    style={{ color: textSecondary }}
                  >
                    Weekly commission breakdown
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={textSecondary}
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              className="p-[14px] border rounded-[12px]"
              style={{ backgroundColor: surfaceBg, borderColor }}
              onPress={() => router.push("/(main)/(rider)/due-amounts")}
            >
              <View className="flex-row justify-between items-center">
                <View>
                  <Text
                    className="text-[15px] font-JakartaBold"
                    style={{ color: textPrimary }}
                  >
                    Due Amounts
                  </Text>
                  <Text
                    className="text-[13px] font-Jakarta mt-1"
                    style={{ color: textSecondary }}
                  >
                    Subscription and commission dues
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={textSecondary}
                />
              </View>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
