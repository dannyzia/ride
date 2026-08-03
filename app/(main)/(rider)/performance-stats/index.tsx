import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface Performance {
  acceptance_rate: number;
  cancellation_rate: number;
  rating: number;
  trips_this_week: number;
  trips_this_month: number;
  online_hours: number;
}

export default function PerformanceStats() {
  const [stats, setStats] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); return; }
        const res = await fetch(`${API_URL}/api/driver/performance`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        if (!cancelled) setStats(data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Network error");
        logger.error("PerformanceStats fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const cards = stats ? [
    { label: "Acceptance rate", value: `${stats.acceptance_rate.toFixed(1)}%`, icon: "📈" },
    { label: "Cancellation rate", value: `${stats.cancellation_rate.toFixed(1)}%`, icon: "🚫" },
    { label: "Driver rating", value: stats.rating.toFixed(2), icon: "⭐" },
    { label: "Trips this week", value: String(stats.trips_this_week), icon: "🏁" },
    { label: "Trips this month", value: String(stats.trips_this_month), icon: "📅" },
    { label: "Online hours", value: `${stats.online_hours}h`, icon: "⏱️" },
  ] : [];

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Performance</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[14px] font-Jakarta text-goDanger text-center mb-4">{error}</Text>
          <TouchableOpacity className="bg-goPrimary rounded-full px-[24px] py-[12px]" onPress={() => { setLoading(true); setError(""); }}>
            <Text className="text-[16px] font-JakartaBold text-goWhite">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="flex-row flex-wrap gap-3">
            {cards.map((s, i) => (
              <View key={i} className="w-[47%] p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]">
                <Text className="text-[28px]">{s.icon}</Text>
                <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mt-1">{s.value}</Text>
                <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">{s.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}