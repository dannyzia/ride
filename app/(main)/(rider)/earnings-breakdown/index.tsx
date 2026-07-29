import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); return; }
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/earnings/breakdown?range=week`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        if (!cancelled) {
          setTrips(data.trips ?? []);
          setTotalEarningsBdt(data.total_earnings_bdt ?? 0);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Network error");
        logger.error("EarningsBreakdown fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totalKm = trips.reduce((s, t) => s + t.distance_km, 0);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Earnings Details</Text>
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
      ) : trips.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">No trips this week</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="p-[14px] bg-goAccentLight border border-goPrimary rounded-[12px] mb-4">
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Total earnings</Text>
            <Text className="text-[24px] font-JakartaBold tracking-tight text-goPrimary">৳{(totalEarningsBdt / 100).toFixed(0)}</Text>
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{trips.length} trips · {totalKm.toFixed(1)} km</Text>
          </View>
          {trips.map((t) => (
            <View key={t.ride_id} className="flex-row justify-between items-center p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-2">
              <View className="flex-1">
                <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{t.origin_address}</Text>
                <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                  {new Date(t.completed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {t.distance_km.toFixed(1)} km
                </Text>
              </View>
              <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">৳{(t.driver_fare_bdt / 100).toFixed(0)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}