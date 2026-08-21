import { useState, useEffect, useCallback, type ComponentProps } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import ChartBar from "@/components/ChartBar";
import ChartLine from "@/components/ChartLine";

type IconName = ComponentProps<typeof Ionicons>["name"];
type Period = "week" | "month";

interface SeriesPoint {
  label: string;
  value_bdt: number;
}

interface Performance {
  acceptance_rate: number;
  cancellation_rate: number;
  rating: number;
  trips_this_week: number;
  trips_this_month: number;
  online_hours: number;
  earnings_series?: SeriesPoint[];
  rating_series?: number[];
  rating_labels?: string[];
}

export default function PerformanceStats() {
  const [stats, setStats] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("week");

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  // Shared fetch so the Retry button re-runs the same path the initial load
  // uses — previously the retry only set loading=true and nothing re-fetched.
  const fetchStats = useCallback(async (p: Period) => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/driver/performance?period=${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); return; }
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("PerformanceStats fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(period);
  }, [fetchStats, period]);

  const cards: { label: string; value: string; icon: IconName }[] = stats ? [
    { label: "Acceptance rate", value: `${stats.acceptance_rate.toFixed(1)}%`, icon: "trending-up" },
    { label: "Cancellation rate", value: `${stats.cancellation_rate.toFixed(1)}%`, icon: "close-circle" },
    { label: "Driver rating", value: stats.rating.toFixed(2), icon: "star" },
    { label: "Trips this week", value: String(stats.trips_this_week), icon: "flag" },
    { label: "Trips this month", value: String(stats.trips_this_month), icon: "calendar" },
    { label: "Online hours", value: `${stats.online_hours}h`, icon: "time" },
  ] : [];

  const earningsData = (stats?.earnings_series ?? []).map((p) => ({ label: p.label, value: p.value_bdt }));
  const ratingPoints = stats?.rating_series ?? [];
  const ratingLabels = stats?.rating_labels ?? [];

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-[12px] p-[4px]">
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Performance</Text>
        <View style={{ width: 32 }} />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[14px] font-Jakarta text-center mb-4" style={{ color: colors.danger }}>{error}</Text>
          <TouchableOpacity className="rounded-full px-[24px] py-[12px]" style={{ backgroundColor: colors.primary }} onPress={() => fetchStats(period)}>
            <Text className="text-[16px] font-JakartaBold" style={{ color: colors.white }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, paddingBottom: 40 }}>
          {/* Weekly / Monthly toggle (§7.19) — driver targets ≥56dp */}
          <View className="flex-row rounded-[12px] mb-4" style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}>
            {(["week", "month"] as Period[]).map((p) => {
              const active = period === p;
              return (
                <TouchableOpacity
                  key={p}
                  className="flex-1 items-center justify-center rounded-[10px]"
                  style={{ minHeight: 56, backgroundColor: active ? colors.primary : "transparent" }}
                  onPress={() => setPeriod(p)}
                >
                  <Text className="text-[16px] font-JakartaSemiBold" style={{ color: active ? colors.white : textSecondary }}>
                    {p === "week" ? "Weekly" : "Monthly"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Earnings bar chart (§7.19) */}
          <View className="p-[16px] border rounded-[16px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
            <Text className="text-[18px] font-JakartaSemiBold mb-3" style={{ color: textPrimary }}>
              Earnings — {period === "week" ? "last 7 days" : "this month"}
            </Text>
            <ChartBar
              data={earningsData}
              formatValue={(v) => `৳${Math.round(v / 100)}`}
            />
          </View>

          {/* Rating trend line chart (§7.19) */}
          <View className="p-[16px] border rounded-[16px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
            <Text className="text-[18px] font-JakartaSemiBold mb-3" style={{ color: textPrimary }}>
              Rating trend
            </Text>
            <ChartLine points={ratingPoints} labels={ratingLabels} />
          </View>

          <View className="flex-row flex-wrap gap-3">
            {cards.map((s, i) => (
              <View key={i} className="w-[47%] p-[16px] border rounded-[12px]" style={{ backgroundColor: surfaceBg, borderColor }}>
                <Ionicons name={s.icon} size={26} color={colors.primary} />
                <Text className="text-[24px] font-JakartaBold tracking-tight mt-1" style={{ color: textPrimary }}>{s.value}</Text>
                <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
