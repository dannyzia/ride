import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

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
  const [data, setData] = useState<CommissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); return; }
        const res = await fetch(`${API_URL}/api/driver/commission-statement`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed"); return; }
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
        logger.error("CommissionStatement fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Commission Statement</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[14px] font-Jakarta text-center mb-4" style={{ color: colors.danger }}>{error}</Text>
          <TouchableOpacity className="rounded-full px-[24px] py-[12px]" style={{ backgroundColor: colors.primary }} onPress={() => { setLoading(true); setError(""); }}>
            <Text className="text-[16px] font-JakartaBold" style={{ color: colors.white }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
            <View className="flex-row justify-between mb-2">
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>Week</Text>
              <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>
                {new Date(data.week_start).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – {new Date(data.week_end).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
              </Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>Total earnings</Text>
              <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>৳{(data.total_earnings_bdt / 100).toFixed(0)}</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>Commission rate</Text>
              <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{data.commission_rate_percent}%</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>Commission charged</Text>
              <Text className="text-[14px] font-JakartaBold" style={{ color: colors.danger }}>৳{(data.commission_charged_bdt / 100).toFixed(0)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>Driver net</Text>
              <Text className="text-[14px] font-JakartaBold" style={{ color: colors.primary }}>৳{(data.driver_net_bdt / 100).toFixed(0)}</Text>
            </View>
          </View>
          <Text className="text-[16px] font-JakartaBold mb-3" style={{ color: textPrimary }}>Trip breakdown</Text>
          {data.trips.length === 0 ? (
            <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>No completed trips this week.</Text>
          ) : (
            data.trips.map((t) => (
              <View key={t.ride_id} className="flex-row justify-between items-center p-[14px] border rounded-[12px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }}>
                <View>
                  <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{new Date(t.completed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</Text>
                  <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>Fare: ৳{(t.total_fare_bdt / 100).toFixed(0)}</Text>
                </View>
                <Text className="text-[14px] font-JakartaBold" style={{ color: colors.danger }}>৳{(t.commission_bdt / 100).toFixed(0)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      ) : null}
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
