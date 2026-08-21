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

interface DuesData {
  subscription: {
    package_name: string | null;
    expires_at: string;
    calls_remaining: number;
    status: string;
  } | null;
  commission_due_bdt: number;
  total_outstanding_bdt: number;
}

export default function DueAmounts() {
  const [data, setData] = useState<DuesData | null>(null);
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

  const fetchData = useCallback(async (isRefresh = false) => {
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
      const res = await fetch(`${API_URL}/api/driver/dues`, {
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
      logger.error("DueAmounts fetch failed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
          Due Amounts
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 40 }}
        />
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
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
          <TouchableOpacity onPress={() => fetchData()} className="mt-3">
            <Text
              className="text-[14px] font-JakartaBold"
              style={{ color: colors.primary }}
            >
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
          {/* Subscription card */}
          {data.subscription ? (
            <View
              className="p-[16px] border rounded-[12px] mb-4"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <Text
                className="text-[12px] font-JakartaSemiBold mb-1"
                style={{ color: textSecondary }}
              >
                SUBSCRIPTION
              </Text>
              <Text
                className="text-[18px] font-JakartaBold"
                style={{ color: textPrimary }}
              >
                {data.subscription.package_name ?? "Active Plan"}
              </Text>
              <View className="flex-row justify-between mt-2">
                <Text
                  className="text-[13px] font-Jakarta"
                  style={{ color: textSecondary }}
                >
                  Calls remaining: {data.subscription.calls_remaining}
                </Text>
                <Text
                  className="text-[13px] font-Jakarta"
                  style={{ color: textSecondary }}
                >
                  Expires:{" "}
                  {new Date(data.subscription.expires_at).toLocaleDateString(
                    "en-GB",
                    { day: "2-digit", month: "short" },
                  )}
                </Text>
              </View>
              <View className="flex-row mt-2">
                <View
                  className="rounded-full px-[10px] py-[2px]"
                  style={{ backgroundColor: `${colors.primary}1A` }}
                >
                  <Text
                    className="text-[11px] font-JakartaBold"
                    style={{ color: colors.primary }}
                  >
                    {data.subscription.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                className="rounded-full w-full py-[12px] items-center mt-3"
                style={{ backgroundColor: colors.primary }}
                onPress={() => router.push("/(main)/(rider)/packages")}
              >
                <Text className="text-[15px] font-JakartaBold text-white">
                  Renew
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View
              className="p-[16px] border rounded-[12px] mb-4"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <Text
                className="text-[14px] font-Jakarta"
                style={{ color: textSecondary }}
              >
                No active subscription
              </Text>
              <TouchableOpacity
                className="rounded-full w-full py-[12px] items-center mt-3"
                style={{ backgroundColor: colors.primary }}
                onPress={() => router.push("/(main)/(rider)/packages")}
              >
                <Text className="text-[15px] font-JakartaBold text-white">
                  Browse Packages
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Commission due */}
          <View
            className="p-[16px] border rounded-[12px] mb-4"
            style={{ backgroundColor: surfaceBg, borderColor }}
          >
            <Text
              className="text-[12px] font-JakartaSemiBold mb-1"
              style={{ color: textSecondary }}
            >
              COMMISSION DUE
            </Text>
            <Text
              className="text-[20px] font-JakartaBold"
              style={{ color: textPrimary }}
            >
              {formatBDT(data.commission_due_bdt)}
            </Text>
            <View className="flex-row mt-2">
              <View
                className="rounded-full px-[10px] py-[2px]"
                style={{ backgroundColor: `${colors.danger}1A` }}
              >
                <Text
                  className="text-[11px] font-JakartaBold"
                  style={{ color: colors.danger }}
                >
                  UNSETTLED
                </Text>
              </View>
            </View>
          </View>

          {/* Total outstanding */}
          <View
            className="p-[16px] rounded-[12px]"
            style={{
              backgroundColor: isDark
                ? colors.primaryLightDark
                : colors.primaryLight,
            }}
          >
            <View className="flex-row justify-between items-center">
              <Text
                className="text-[14px] font-JakartaSemiBold"
                style={{ color: textPrimary }}
              >
                TOTAL OUTSTANDING
              </Text>
              <Text
                className="text-[20px] font-JakartaBold"
                style={{ color: colors.danger }}
              >
                {formatBDT(data.total_outstanding_bdt)}
              </Text>
            </View>
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}
