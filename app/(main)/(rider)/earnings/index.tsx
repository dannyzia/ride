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

interface DailyStats {
  earnings_bdt: number;
  trips: number;
  online_hours: number;
  rating: number | null;
  acceptance_rate: number | null;
}

export default function EarningsDashboard() {
  const { t } = useTranslation();
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
        setError(t('earnings.not_authenticated'));
        return;
      }
      const res = await fetch(`${API_URL}/api/driver/daily-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(t('earnings.failed_to_load'));
        return;
      }
      setStats(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('earnings.network_error'));
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
          {t('earnings.title')}
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
                {t('common.retry')}
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
                {t('earnings.todays_earnings')}
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
                    {t('earnings.trips')}
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
                    {t('earnings.online')}
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
                      {t('earnings.rating')}
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
                    {t('earnings.earnings_breakdown')}
                  </Text>
                  <Text
                    className="text-[13px] font-Jakarta mt-1"
                    style={{ color: textSecondary }}
                  >
                    {t('earnings.earnings_breakdown_desc')}
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
                    {t('earnings.commission_statement')}
                  </Text>
                  <Text
                    className="text-[13px] font-Jakarta mt-1"
                    style={{ color: textSecondary }}
                  >
                    {t('earnings.commission_statement_desc')}
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
                    {t('earnings.due_amounts')}
                  </Text>
                  <Text
                    className="text-[13px] font-Jakarta mt-1"
                    style={{ color: textSecondary }}
                  >
                    {t('earnings.due_amounts_desc')}
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
