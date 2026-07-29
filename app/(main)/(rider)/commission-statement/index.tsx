import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); return; }
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/commission-statement`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed"); return; }
        if (!cancelled) setData(json);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Network error");
        logger.error("CommissionStatement fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Commission Statement</Text>
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
      ) : data ? (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-4">
            <View className="flex-row justify-between mb-2">
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Week</Text>
              <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
                {new Date(data.week_start).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – {new Date(data.week_end).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
              </Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Total earnings</Text>
              <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">৳{(data.total_earnings_bdt / 100).toFixed(0)}</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Commission rate</Text>
              <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{data.commission_rate_percent}%</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Commission charged</Text>
              <Text className="text-[14px] font-JakartaBold text-goDanger">৳{(data.commission_charged_bdt / 100).toFixed(0)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Driver net</Text>
              <Text className="text-[14px] font-JakartaBold text-goPrimary">৳{(data.driver_net_bdt / 100).toFixed(0)}</Text>
            </View>
          </View>
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-3">Trip breakdown</Text>
          {data.trips.length === 0 ? (
            <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">No completed trips this week.</Text>
          ) : (
            data.trips.map((t) => (
              <View key={t.ride_id} className="flex-row justify-between items-center p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-2">
                <View>
                  <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{new Date(t.completed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</Text>
                  <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Fare: ৳{(t.total_fare_bdt / 100).toFixed(0)}</Text>
                </View>
                <Text className="text-[14px] font-JakartaBold text-goDanger">৳{(t.commission_bdt / 100).toFixed(0)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}