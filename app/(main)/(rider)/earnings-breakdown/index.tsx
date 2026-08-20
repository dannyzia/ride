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

interface TripRow {
  ride_id: string;
  completed_at: string;
  fare_bdt: number;
  driver_fare_bdt: number;
  distance_km: number;
  origin_address: string;
  destination_address: string;
}

export default function EarningsBreakdown() {
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [totalEarningsBdt, setTotalEarningsBdt] = useState(0);
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
        const res = await fetch(`${API_URL}/api/driver/earnings/breakdown?range=week`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        if (!cancelled) {
          setTrips(data.trips ?? []);
          setTotalEarningsBdt(data.total_earnings_bdt ?? 0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
        logger.error("EarningsBreakdown fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totalKm = trips.reduce((s, t) => s + t.distance_km, 0);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Earnings Details</Text>
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
      ) : trips.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta" style={{ color: textSecondary }}>No trips this week</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="p-[14px] border rounded-[12px] mb-4" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight, borderColor: colors.primary }}>
            <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>Total earnings</Text>
            <Text className="text-[24px] font-JakartaBold tracking-tight" style={{ color: colors.primary }}>৳{(totalEarningsBdt / 100).toFixed(0)}</Text>
            <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{trips.length} trips · {totalKm.toFixed(1)} km</Text>
          </View>
          {trips.map((t) => (
            <View key={t.ride_id} className="flex-row justify-between items-center p-[14px] border rounded-[12px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }}>
              <View className="flex-1">
                <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{t.origin_address}</Text>
                <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                  {new Date(t.completed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {t.distance_km.toFixed(1)} km
                </Text>
              </View>
              <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>৳{(t.driver_fare_bdt / 100).toFixed(0)}</Text>
            </View>
          ))}
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
