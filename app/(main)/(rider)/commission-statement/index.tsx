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

interface CommissionTrip {
  ride_id: string;
  completed_at: string;
  total_fare_bdt: number;
  commission_bdt: number;
  driver_net_bdt: number;
}

interface CommissionData {
  week_start: string;
  week_end: string;
  total_earnings_bdt: number;
  commission_rate_percent: number;
  commission_charged_bdt: number;
  driver_net_bdt: number;
  trips: CommissionTrip[];
}

export default function CommissionStatement() {
  const { t } = useTranslation();  const [data, setData] = useState<CommissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);

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
        const params = new URLSearchParams();
        if (weekOffset > 0) params.set("week_offset", String(weekOffset));
        const url = `${API_URL}/api/driver/commission-statement${params.toString() ? `?${params}` : ""}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Failed");
          return;
        }
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
        logger.error("CommissionStatement fetch failed", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [weekOffset],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
          Commission Statement
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Week navigation */}
      <View
        className="flex-row items-center justify-between px-[24px] py-[12px]"
        style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}
      >
        <TouchableOpacity
          onPress={() => setWeekOffset((o) => o + 1)}
          disabled={weekOffset >= 11}
          className="p-[6px]"
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={weekOffset >= 11 ? textSecondary : colors.primary}
          />
        </TouchableOpacity>
        <Text
          className="text-[14px] font-JakartaSemiBold"
          style={{ color: textPrimary }}
        >
          {weekOffset === 0
            ? "This Week"
            : `${weekOffset} week${weekOffset > 1 ? "s" : ""} ago`}
        </Text>
        <TouchableOpacity
          onPress={() => setWeekOffset((o) => Math.max(0, o - 1))}
          disabled={weekOffset === 0}
          className="p-[6px]"
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={weekOffset === 0 ? textSecondary : colors.primary}
          />
        </TouchableOpacity>
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
      ) : data ? (
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
            className="p-[16px] border rounded-[12px] mb-4"
            style={{ backgroundColor: surfaceBg, borderColor }}
          >
            <View className="flex-row justify-between mb-2">
              <Text
                className="text-[13px] font-Jakarta"
                style={{ color: textSecondary }}
              >
                Week
              </Text>
              <Text
                className="text-[13px] font-JakartaSemiBold"
                style={{ color: textPrimary }}
              >
                {new Date(data.week_start).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}{" "}
                –{" "}
                {new Date(data.week_end).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
              </Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text
                className="text-[13px] font-Jakarta"
                style={{ color: textSecondary }}
              >
                Total earnings
              </Text>
              <Text
                className="text-[14px] font-JakartaBold"
                style={{ color: textPrimary }}
              >
                {formatBDT(data.total_earnings_bdt)}
              </Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text
                className="text-[13px] font-Jakarta"
                style={{ color: textSecondary }}
              >
                Commission rate
              </Text>
              <Text
                className="text-[14px] font-JakartaBold"
                style={{ color: textPrimary }}
              >
                {data.commission_rate_percent}%
              </Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text
                className="text-[13px] font-Jakarta"
                style={{ color: textSecondary }}
              >
                Commission charged
              </Text>
              <Text
                className="text-[14px] font-JakartaBold"
                style={{ color: colors.danger }}
              >
                {formatBDT(data.commission_charged_bdt)}
              </Text>
            </View>
            <View
              className="flex-row justify-between pt-2"
              style={{ borderTopWidth: 1, borderTopColor: borderColor }}
            >
              <Text
                className="text-[14px] font-JakartaSemiBold"
                style={{ color: textPrimary }}
              >
                Driver net
              </Text>
              <Text
                className="text-[16px] font-JakartaBold"
                style={{ color: colors.primary }}
              >
                {formatBDT(data.driver_net_bdt)}
              </Text>
            </View>
          </View>

          {/* No PDF note */}
          <View
            className="rounded-[12px] p-[12px] mb-4"
            style={{
              backgroundColor: `${colors.info}10`,
              borderWidth: 1,
              borderColor: `${colors.info}20`,
            }}
          >
            <Text
              className="text-[12px] font-Jakarta"
              style={{ color: textSecondary }}
            >
              PDF download is not yet available. Contact support for a formal
              commission statement.
            </Text>
          </View>

          {/* Trip breakdown */}
          <Text
            className="text-[16px] font-JakartaBold mb-3"
            style={{ color: textPrimary }}
          >
            Trip Breakdown
          </Text>
          {data.trips.length === 0 ? (
            <Text
              className="text-[14px] font-Jakarta"
              style={{ color: textSecondary }}
            >
              No completed trips this week.
            </Text>
          ) : (
            data.trips.map((t) => (
              <View
                key={t.ride_id}
                className="flex-row justify-between items-center p-[14px] border rounded-[12px] mb-2"
                style={{ backgroundColor: surfaceBg, borderColor }}
              >
                <View>
                  <Text
                    className="text-[14px] font-JakartaBold"
                    style={{ color: textPrimary }}
                  >
                    {new Date(t.completed_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </Text>
                  <Text
                    className="text-[12px] font-Jakarta"
                    style={{ color: textSecondary }}
                  >
                    Fare: {formatBDT(t.total_fare_bdt)}
                  </Text>
                </View>
                <Text
                  className="text-[14px] font-JakartaBold"
                  style={{ color: colors.danger }}
                >
                  {formatBDT(t.commission_bdt)}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}
